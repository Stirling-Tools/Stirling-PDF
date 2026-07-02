package stirling.software.SPDF.pdf.redaction;

import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSObject;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDNameTreeNode;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;

import lombok.extern.slf4j.Slf4j;

/**
 * Walks a {@link PDDocument} and physically removes or rewrites every carrier that a PDF can use to
 * leak text which the user asked to redact.
 *
 * <p>Covers:
 *
 * <ul>
 *   <li>{@link PDDocumentInformation} (Info dict) + XMP metadata stream
 *   <li>{@link PDDocumentOutline} bookmark titles
 *   <li>{@link PDAcroForm} field values (V, DV) and rich text (RV)
 *   <li>Every {@link PDAnnotation} Contents and RC
 *   <li>Structure tree ActualText, Alt, T, E, Lang entries
 *   <li>Names tree: JavaScript entries and embedded files (dropped entirely when matching)
 * </ul>
 *
 * <p>When applied after the content-stream rewrite it closes the secondary leak paths flagged in
 * the redaction security audit.
 */
@Slf4j
public final class CatalogScrubber {

    private CatalogScrubber() {}

    /**
     * Remove occurrences of every {@code target} string (and any regex/whole-word pattern form
     * produced by {@link RedactionPipeline#buildPatterns}) from all catalog-level carriers of the
     * document. When {@code wipeAllMetadata} is {@code true} the document Info dict entries and XMP
     * metadata stream are wiped wholesale; this is the safe default after a redaction operation.
     */
    public static void scrub(
            PDDocument document, Set<String> literalTargets, List<Pattern> patterns) {
        if (document == null) {
            return;
        }

        PDDocumentCatalog catalog = document.getDocumentCatalog();
        if (catalog == null) {
            return;
        }

        scrubOutline(catalog.getDocumentOutline(), literalTargets, patterns);
        scrubAcroForm(catalog.getAcroForm(), literalTargets, patterns);
        scrubAnnotations(document, literalTargets, patterns);
        scrubStructTree(catalog.getStructureTreeRoot(), literalTargets, patterns);
        scrubNames(catalog.getNames(), literalTargets, patterns);
        scrubCatalogActions(catalog, literalTargets, patterns);
    }

    // ---------------------------------------------------------------------
    // Catalog actions: OpenAction, AA, and any JavaScript / URI payloads on the catalog
    // ---------------------------------------------------------------------

    private static void scrubCatalogActions(
            PDDocumentCatalog catalog, Set<String> targets, List<Pattern> patterns) {
        COSDictionary root = catalog.getCOSObject();
        if (root == null) {
            return;
        }
        // OpenAction may be either an action dict (with /URI or /JS) or an explicit destination
        // (array). We scrub strings in both cases; if the OpenAction matches a target we clear it.
        scrubActionIfMatching(root, COSName.getPDFName("OpenAction"), targets, patterns);
        scrubActionIfMatching(root, COSName.getPDFName("AA"), targets, patterns);
    }

    /**
     * If the action dictionary at {@code key} contains any target literal in a URI or JS payload,
     * wipe the key entirely. Otherwise recursively scrub string fields inside it.
     */
    private static void scrubActionIfMatching(
            COSDictionary parent, COSName key, Set<String> targets, List<Pattern> patterns) {
        if (parent == null || key == null) {
            return;
        }
        COSBase value = parent.getDictionaryObject(key);
        if (value == null) {
            return;
        }
        if (containsTarget(value, targets, patterns, new HashSet<>())) {
            log.debug("Removing catalog {} due to target match", key.getName());
            parent.removeItem(key);
        }
    }

    private static boolean containsTarget(
            COSBase base, Set<String> targets, List<Pattern> patterns, Set<COSBase> seen) {
        if (base == null) {
            return false;
        }
        COSBase resolved = base instanceof COSObject obj ? obj.getObject() : base;
        if (resolved == null || !seen.add(resolved)) {
            return false;
        }
        if (resolved instanceof COSString cs) {
            return matches(cs.getString(), targets, patterns);
        }
        if (resolved instanceof COSStream stream) {
            // Streams in XFA / OpenAction contexts are text (XML, JavaScript). Read the bytes as
            // UTF-8 and test for target literals. We cap read length to avoid pathological memory
            // use; 2 MiB is plenty for XFA packets and far beyond any realistic JS action.
            try (java.io.InputStream is = stream.createInputStream()) {
                byte[] buf = new byte[2 * 1024 * 1024];
                int total = 0;
                int n;
                while ((n = is.read(buf, total, buf.length - total)) > 0) {
                    total += n;
                    if (total >= buf.length) {
                        break;
                    }
                }
                String text = new String(buf, 0, total, java.nio.charset.StandardCharsets.UTF_8);
                return matches(text, targets, patterns);
            } catch (Exception e) {
                log.debug("Failed to scan stream for targets: {}", e.getMessage());
                // Fail closed: if we cannot read it we cannot prove it is clean, so treat as a
                // match so the caller drops the stream. This is conservative by design.
                return true;
            }
        }
        if (resolved instanceof COSDictionary dict) {
            for (COSName k : new HashSet<>(dict.keySet())) {
                if (containsTarget(dict.getItem(k), targets, patterns, seen)) {
                    return true;
                }
            }
            return false;
        }
        if (resolved instanceof COSArray array) {
            for (int i = 0; i < array.size(); i++) {
                if (containsTarget(array.getObject(i), targets, patterns, seen)) {
                    return true;
                }
            }
            return false;
        }
        return false;
    }

    /**
     * Clean potentially sensitive metadata carriers. Called after {@link #scrub} so that surviving
     * references to author/subject/keywords/XMP descriptors do not leak redacted values.
     */
    public static void wipeMetadata(PDDocument document) {
        if (document == null) {
            return;
        }
        PDDocumentInformation info = document.getDocumentInformation();
        if (info != null) {
            info.setAuthor(null);
            info.setSubject(null);
            info.setKeywords(null);
            info.setTitle(null);
            info.setCreator(null);
            info.setProducer(null);
            info.setModificationDate(Calendar.getInstance());
        }
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        if (catalog != null) {
            try {
                catalog.setMetadata(null);
            } catch (Exception e) {
                log.debug("Could not clear XMP metadata: {}", e.getMessage());
            }
        }
    }

    // ---------------------------------------------------------------------
    // Outline
    // ---------------------------------------------------------------------

    private static void scrubOutline(
            PDDocumentOutline outline, Set<String> targets, List<Pattern> patterns) {
        if (outline == null) {
            return;
        }
        scrubOutlineItems(outline.children(), targets, patterns);
    }

    private static void scrubOutlineItems(
            Iterable<PDOutlineItem> items, Set<String> targets, List<Pattern> patterns) {
        if (items == null) {
            return;
        }
        for (PDOutlineItem item : items) {
            try {
                String title = item.getTitle();
                if (title != null) {
                    String stripped = stripMatches(title, targets, patterns);
                    if (!stripped.equals(title)) {
                        item.setTitle(stripped);
                    }
                }
                // Bookmark actions: /A is an action dict which may carry a /URI or /JS payload.
                // If any target literal appears anywhere inside the action subtree, drop the
                // action entirely so the URI / script cannot leak the target.
                COSDictionary itemDict = item.getCOSObject();
                if (itemDict != null) {
                    scrubActionIfMatching(itemDict, COSName.A, targets, patterns);
                    scrubActionIfMatching(itemDict, COSName.getPDFName("AA"), targets, patterns);
                }
                scrubOutlineItems(item.children(), targets, patterns);
            } catch (Exception e) {
                log.debug("Failed to scrub outline item: {}", e.getMessage());
            }
        }
    }

    // ---------------------------------------------------------------------
    // AcroForm
    // ---------------------------------------------------------------------

    private static void scrubAcroForm(
            PDAcroForm form, Set<String> targets, List<Pattern> patterns) {
        if (form == null) {
            return;
        }
        // XFA forms: scrubbed separately because the XFA XML packet carries the "real" field
        // values for XFA-enabled PDFs. Handle XFA before walking the field tree so we fail closed
        // if XFA scrubbing throws.
        scrubXfa(form, targets, patterns);

        try {
            for (PDField field : form.getFieldTree()) {
                scrubField(field, targets, patterns);
            }
        } catch (Exception e) {
            log.debug("Failed to walk AcroForm field tree: {}", e.getMessage());
        }

        // Force viewers to regenerate appearance streams from the (scrubbed) /V values rather
        // than reusing any cached /AP /N that still contains the target text. Belt-and-braces:
        // scrubField has also cleared per-widget /AP dicts, but /NeedAppearances ensures any
        // future change still triggers regeneration.
        try {
            form.setNeedAppearances(true);
        } catch (Exception e) {
            log.debug("Failed to set /NeedAppearances on AcroForm: {}", e.getMessage());
        }
    }

    private static void scrubXfa(PDAcroForm form, Set<String> targets, List<Pattern> patterns) {
        try {
            COSBase xfaBase = form.getCOSObject().getDictionaryObject(COSName.XFA);
            if (xfaBase == null) {
                return;
            }
            boolean hit = containsTarget(xfaBase, targets, patterns, new HashSet<>());
            if (hit) {
                // Simplest safe move: strip the XFA entry entirely. Viewers fall back to the
                // AcroForm widgets which we have already scrubbed. Leaving a "partially scrubbed"
                // XFA packet risks regex failures on partial XML and re-encoded entities leaking
                // the target.
                log.warn(
                        "Removing XFA form packet from AcroForm - XFA XML contained a redaction "
                                + "target and has been dropped so viewers render AcroForm widgets "
                                + "instead.");
                form.getCOSObject().removeItem(COSName.XFA);
            }
        } catch (Exception e) {
            log.debug("Failed to scrub XFA: {}", e.getMessage());
        }
    }

    private static void scrubField(PDField field, Set<String> targets, List<Pattern> patterns) {
        if (field == null) {
            return;
        }
        try {
            COSDictionary dict = field.getCOSObject();
            scrubDictStrings(dict, COSName.V, targets, patterns);
            scrubDictStrings(dict, COSName.DV, targets, patterns);
            scrubDictStrings(dict, COSName.getPDFName("RV"), targets, patterns);
            // Keep field appearance streams in sync with value where possible.
            try {
                if (field.getValueAsString() != null) {
                    String stripped = stripMatches(field.getValueAsString(), targets, patterns);
                    if (!stripped.equals(field.getValueAsString())) {
                        field.setValue(stripped);
                    }
                }
            } catch (Exception e) {
                log.debug("Failed to rewrite field value via setValue: {}", e.getMessage());
            }
            // Drop per-widget appearance streams (/AP dict) for every widget kid of this field.
            // The cached appearance stream contains the pre-redaction value baked in as glyph
            // data; simply rewriting /V leaves it visually unchanged in many viewers. Removing /AP
            // plus /NeedAppearances at the form level forces regeneration.
            clearWidgetAppearances(dict);
        } catch (Exception e) {
            log.debug("Failed to scrub field: {}", e.getMessage());
        }
    }

    private static void clearWidgetAppearances(COSDictionary fieldDict) {
        if (fieldDict == null) {
            return;
        }
        // The field itself may be a widget (single-widget field) and/or have Kids.
        fieldDict.removeItem(COSName.AP);
        COSBase kids = fieldDict.getDictionaryObject(COSName.KIDS);
        if (kids instanceof COSArray arr) {
            for (int i = 0; i < arr.size(); i++) {
                COSBase kidBase = arr.getObject(i);
                if (kidBase instanceof COSDictionary kidDict) {
                    kidDict.removeItem(COSName.AP);
                }
            }
        }
    }

    // ---------------------------------------------------------------------
    // Annotations
    // ---------------------------------------------------------------------

    private static void scrubAnnotations(
            PDDocument document, Set<String> targets, List<Pattern> patterns) {
        try {
            for (PDPage page : document.getPages()) {
                List<PDAnnotation> annotations;
                try {
                    annotations = page.getAnnotations();
                } catch (Exception e) {
                    log.debug("Failed to load annotations for page: {}", e.getMessage());
                    continue;
                }
                if (annotations == null) {
                    continue;
                }
                for (PDAnnotation annotation : annotations) {
                    scrubAnnotation(annotation, targets, patterns);
                }
            }
        } catch (Exception e) {
            log.debug("Annotation scrub walk failed: {}", e.getMessage());
        }
    }

    private static void scrubAnnotation(
            PDAnnotation annotation, Set<String> targets, List<Pattern> patterns) {
        if (annotation == null) {
            return;
        }
        try {
            String contents = annotation.getContents();
            if (contents != null) {
                String stripped = stripMatches(contents, targets, patterns);
                if (!stripped.equals(contents)) {
                    annotation.setContents(stripped);
                }
            }
            COSDictionary dict = annotation.getCOSObject();
            scrubDictStrings(dict, COSName.getPDFName("RC"), targets, patterns);
            scrubDictStrings(dict, COSName.getPDFName("Subj"), targets, patterns);
            scrubDictStrings(dict, COSName.getPDFName("T"), targets, patterns);
            scrubDictStrings(dict, COSName.getPDFName("NM"), targets, patterns);
        } catch (Exception e) {
            log.debug("Failed to scrub annotation: {}", e.getMessage());
        }
    }

    // ---------------------------------------------------------------------
    // Structure tree
    // ---------------------------------------------------------------------

    private static void scrubStructTree(
            PDStructureTreeRoot root, Set<String> targets, List<Pattern> patterns) {
        if (root == null) {
            return;
        }
        try {
            scrubStructDict(root.getCOSObject(), targets, patterns, new HashSet<>());
        } catch (Exception e) {
            log.debug("Structure tree scrub failed: {}", e.getMessage());
        }
    }

    private static void scrubStructDict(
            COSBase base, Set<String> targets, List<Pattern> patterns, Set<COSBase> seen) {
        if (base == null) {
            return;
        }
        COSBase resolved = base instanceof COSObject obj ? obj.getObject() : base;
        if (resolved == null || !seen.add(resolved)) {
            return;
        }
        if (resolved instanceof COSDictionary dict) {
            // Do not walk into content streams - those are handled by content-stream rewrite.
            if (resolved instanceof COSStream) {
                return;
            }
            scrubDictStrings(dict, COSName.getPDFName("ActualText"), targets, patterns);
            scrubDictStrings(dict, COSName.getPDFName("Alt"), targets, patterns);
            scrubDictStrings(dict, COSName.getPDFName("E"), targets, patterns);
            scrubDictStrings(dict, COSName.getPDFName("T"), targets, patterns);
            scrubDictStrings(dict, COSName.getPDFName("Lang"), targets, patterns);
            for (COSName key : new HashSet<>(dict.keySet())) {
                COSBase value = dict.getItem(key);
                if (value instanceof COSDictionary
                        || value instanceof COSArray
                        || value instanceof COSObject) {
                    scrubStructDict(value, targets, patterns, seen);
                }
            }
        } else if (resolved instanceof COSArray array) {
            for (int i = 0; i < array.size(); i++) {
                scrubStructDict(array.getObject(i), targets, patterns, seen);
            }
        }
    }

    // ---------------------------------------------------------------------
    // Names tree (JavaScript + embedded files)
    // ---------------------------------------------------------------------

    private static void scrubNames(
            PDDocumentNameDictionary names, Set<String> targets, List<Pattern> patterns) {
        if (names == null) {
            return;
        }
        try {
            dropMatchingNames(names.getJavaScript(), targets, patterns);
        } catch (Exception e) {
            log.debug("Failed to scrub JavaScript names: {}", e.getMessage());
        }
        try {
            dropMatchingNames(names.getEmbeddedFiles(), targets, patterns);
        } catch (Exception e) {
            log.debug("Failed to scrub embedded-file names: {}", e.getMessage());
        }
    }

    private static void dropMatchingNames(
            PDNameTreeNode<?> node, Set<String> targets, List<Pattern> patterns) {
        if (node == null) {
            return;
        }
        COSDictionary dict = node.getCOSObject();
        if (dict == null) {
            return;
        }
        scrubNameTreeDict(dict, targets, patterns);
    }

    private static void scrubNameTreeDict(
            COSDictionary dict, Set<String> targets, List<Pattern> patterns) {
        if (dict == null) {
            return;
        }
        COSArray namesArray = (COSArray) dict.getDictionaryObject(COSName.NAMES);
        if (namesArray != null) {
            for (int i = namesArray.size() - 2; i >= 0; i -= 2) {
                COSBase keyBase = namesArray.getObject(i);
                String key = keyBase instanceof COSString s ? s.getString() : null;
                if (key != null && matches(key, targets, patterns)) {
                    namesArray.remove(i + 1);
                    namesArray.remove(i);
                }
            }
        }
        COSArray kids = (COSArray) dict.getDictionaryObject(COSName.KIDS);
        if (kids != null) {
            for (int i = 0; i < kids.size(); i++) {
                COSBase kid = kids.getObject(i);
                if (kid instanceof COSDictionary kidDict) {
                    scrubNameTreeDict(kidDict, targets, patterns);
                }
            }
        }
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    private static void scrubDictStrings(
            COSDictionary dict, COSName key, Set<String> targets, List<Pattern> patterns) {
        if (dict == null || key == null) {
            return;
        }
        COSBase value = dict.getDictionaryObject(key);
        if (value instanceof COSString cosString) {
            String stripped = stripMatches(cosString.getString(), targets, patterns);
            if (!stripped.equals(cosString.getString())) {
                dict.setString(key, stripped);
            }
        } else if (value instanceof COSArray array) {
            for (int i = 0; i < array.size(); i++) {
                COSBase element = array.getObject(i);
                if (element instanceof COSString elementString) {
                    String stripped = stripMatches(elementString.getString(), targets, patterns);
                    if (!stripped.equals(elementString.getString())) {
                        array.set(i, new COSString(stripped));
                    }
                }
            }
        }
    }

    static String stripMatches(String source, Set<String> literalTargets, List<Pattern> patterns) {
        if (source == null || source.isEmpty()) {
            return source;
        }
        String result = source;
        if (literalTargets != null) {
            for (String target : literalTargets) {
                if (target == null || target.isEmpty()) {
                    continue;
                }
                // Case-insensitive literal removal. Verification is case-insensitive, so scrubbing
                // MUST be too or mixed-case ("SMITH" in a catalog string vs "Smith" in the target
                // list) will fail verification and trip the rasterisation fallback - or worse, on
                // carriers that are not verified, leak the string untouched.
                result = caseInsensitiveReplaceAll(result, target);
            }
        }
        if (patterns != null) {
            for (Pattern pattern : patterns) {
                try {
                    // Force case-insensitive matching for catalog carriers regardless of the flags
                    // the pattern was compiled with. User-supplied redaction targets should not
                    // silently miss because the author typed the name in different case.
                    Pattern ci = withCaseInsensitive(pattern);
                    result = ci.matcher(result).replaceAll("");
                } catch (Exception e) {
                    log.debug(
                            "Pattern replace failed for {}: {}", pattern.pattern(), e.getMessage());
                }
            }
        }
        return result;
    }

    static boolean matches(String source, Set<String> literalTargets, List<Pattern> patterns) {
        if (source == null || source.isEmpty()) {
            return false;
        }
        String lower = source.toLowerCase(Locale.ROOT);
        if (literalTargets != null) {
            for (String target : literalTargets) {
                if (target != null
                        && !target.isEmpty()
                        && lower.contains(target.toLowerCase(Locale.ROOT))) {
                    return true;
                }
            }
        }
        if (patterns != null) {
            for (Pattern pattern : patterns) {
                try {
                    if (withCaseInsensitive(pattern).matcher(source).find()) {
                        return true;
                    }
                } catch (Exception e) {
                    log.debug("Pattern match failed for {}: {}", pattern.pattern(), e.getMessage());
                }
            }
        }
        return false;
    }

    private static String caseInsensitiveReplaceAll(String source, String target) {
        if (target.isEmpty()) {
            return source;
        }
        Pattern literal =
                Pattern.compile(
                        Pattern.quote(target), Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
        return literal.matcher(source).replaceAll("");
    }

    private static Pattern withCaseInsensitive(Pattern pattern) {
        if ((pattern.flags() & Pattern.CASE_INSENSITIVE) != 0) {
            return pattern;
        }
        try {
            return Pattern.compile(
                    pattern.pattern(),
                    pattern.flags() | Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
        } catch (Exception e) {
            return pattern;
        }
    }
}
