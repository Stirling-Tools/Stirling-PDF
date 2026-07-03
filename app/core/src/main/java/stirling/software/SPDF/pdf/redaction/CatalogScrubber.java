package stirling.software.SPDF.pdf.redaction;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.LinkedHashSet;
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
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.PDNameTreeNode;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;

import lombok.extern.slf4j.Slf4j;

/** Removes/rewrites every catalog carrier that could leak redacted text. */
@Slf4j
public final class CatalogScrubber {

    // A literal shorter than this won't delete a whole carrier (JS/XFA/action/embedded file).
    private static final int MIN_CARRIER_DROP_LITERAL = 3;

    private CatalogScrubber() {}

    /** Scrub all catalog-level carriers of the given literal/regex targets. */
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
        scrubDocumentInfo(document, literalTargets, patterns);
    }

    // Catalog actions: OpenAction, AA, and any JavaScript / URI payloads

    private static void scrubCatalogActions(
            PDDocumentCatalog catalog, Set<String> targets, List<Pattern> patterns) {
        COSDictionary root = catalog.getCOSObject();
        if (root == null) {
            return;
        }
        // OpenAction may be either an action dict (with /URI or /JS) or an explicit
        scrubActionIfMatching(root, COSName.getPDFName("OpenAction"), targets, patterns);
        scrubActionIfMatching(root, COSName.getPDFName("AA"), targets, patterns);
    }

    /** Drop the action at key if any target appears in its URI/JS payload. */
    private static void scrubActionIfMatching(
            COSDictionary parent, COSName key, Set<String> targets, List<Pattern> patterns) {
        if (parent == null || key == null) {
            return;
        }
        COSBase value = parent.getDictionaryObject(key);
        if (value == null) {
            return;
        }
        if (containsTarget(value, carrierDropLiterals(targets), patterns, new HashSet<>())) {
            log.debug("Removing catalog {} due to target match", key.getName());
            parent.removeItem(key);
        }
    }

    /**
     * Literals specific enough to justify DELETING an entire carrier (JS / XFA / action / embedded
     * file). Sub-threshold literals (a single digit, a 2-char run) would nuke unrelated carriers,
     * so they are excluded from whole-carrier drops - they are still removed in-string by
     * stripMatches where the carrier is a plain string.
     */
    private static Set<String> carrierDropLiterals(Set<String> targets) {
        if (targets == null) {
            return java.util.Collections.emptySet();
        }
        Set<String> specific = new LinkedHashSet<>();
        for (String t : targets) {
            if (t != null && t.trim().length() >= MIN_CARRIER_DROP_LITERAL) {
                specific.add(t);
            }
        }
        return specific;
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
            // Streams in XFA / OpenAction contexts are text (XML, JavaScript).
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
                if (matches(text, targets, patterns)) {
                    return true;
                }
                // Fail closed: content past the 2 MiB cap is unproven, so treat as a match.
                return total >= buf.length && is.read() >= 0;
            } catch (Exception e) {
                log.debug("Failed to scan stream for targets: {}", e.getMessage());
                // Fail closed: if we cannot read it we cannot prove it is clean, so treat
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
     * Remove the redaction target from /Info string entries and drop the XMP packet only if it
     * carries a target. Non-matching document properties (Title, Author, dates) are left intact -
     * redaction removes the target, it does not blanket-wipe metadata.
     */
    private static void scrubDocumentInfo(
            PDDocument document, Set<String> targets, List<Pattern> patterns) {
        PDDocumentInformation info = document.getDocumentInformation();
        if (info != null && info.getCOSObject() != null) {
            COSDictionary infoDict = info.getCOSObject();
            for (COSName key : new HashSet<>(infoDict.keySet())) {
                if (infoDict.getDictionaryObject(key) instanceof COSString cs) {
                    String stripped = stripMatches(cs.getString(), targets, patterns);
                    if (!stripped.equals(cs.getString())) {
                        if (stripped.isEmpty()) {
                            infoDict.removeItem(key);
                        } else {
                            infoDict.setString(key, stripped);
                        }
                    }
                }
            }
        }
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        if (catalog != null && catalog.getMetadata() != null) {
            scrubXmp(document, catalog, targets, patterns);
        }
    }

    /**
     * XMP is RDF/XML that usually mirrors /Info. Strip only the target occurrences so non-matching
     * properties (dates, rights, custom schema) survive; fall back to dropping the whole packet if
     * the edit can't be proven to have removed the target (e.g. entity-encoded) or anything throws.
     */
    private static void scrubXmp(
            PDDocument document,
            PDDocumentCatalog catalog,
            Set<String> targets,
            List<Pattern> patterns) {
        String xmp;
        try {
            xmp = new String(catalog.getMetadata().toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.debug("Could not read XMP metadata: {}", e.getMessage());
            return;
        }
        if (!matches(xmp, targets, patterns)) {
            return;
        }
        try {
            String stripped = stripMatches(xmp, targets, patterns);
            // Only keep the edited packet if the target is provably gone from it.
            if (!matches(stripped, targets, patterns)) {
                catalog.setMetadata(
                        new PDMetadata(
                                document,
                                new ByteArrayInputStream(
                                        stripped.getBytes(StandardCharsets.UTF_8))));
                return;
            }
        } catch (Exception e) {
            log.debug("Surgical XMP scrub failed; dropping packet: {}", e.getMessage());
        }
        catalog.setMetadata(null);
    }

    // Outline

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
                // Bookmark actions: /A is an action dict which may carry a /URI or /JS
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

    // AcroForm

    private static void scrubAcroForm(
            PDAcroForm form, Set<String> targets, List<Pattern> patterns) {
        if (form == null) {
            return;
        }
        // XFA forms: scrubbed separately because the XFA XML packet carries
        scrubXfa(form, targets, patterns);

        try {
            for (PDField field : form.getFieldTree()) {
                scrubField(field, targets, patterns);
            }
        } catch (Exception e) {
            log.debug("Failed to walk AcroForm field tree: {}", e.getMessage());
        }

        // Force viewers to regenerate appearance streams from the (scrubbed) /V
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
            boolean hit =
                    containsTarget(
                            xfaBase, carrierDropLiterals(targets), patterns, new HashSet<>());
            if (hit) {
                // Simplest safe move: strip the XFA entry entirely.
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
            // Only touch fields whose own values actually contain a target: clearing /AP
            // document-wide blanks unrelated fields in viewers that ignore /NeedAppearances.
            boolean matched =
                    dictValueMatches(dict, COSName.V, targets, patterns)
                            || dictValueMatches(dict, COSName.DV, targets, patterns)
                            || dictValueMatches(dict, COSName.getPDFName("RV"), targets, patterns)
                            || dictValueMatches(dict, COSName.getPDFName("TU"), targets, patterns)
                            || buttonCaptionMatches(dict, targets, patterns)
                            || fieldValueMatches(field, targets, patterns);
            if (!matched) {
                return;
            }
            scrubDictStrings(dict, COSName.V, targets, patterns);
            scrubDictStrings(dict, COSName.DV, targets, patterns);
            scrubDictStrings(dict, COSName.getPDFName("RV"), targets, patterns);
            scrubDictStrings(dict, COSName.getPDFName("TU"), targets, patterns);
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
            if (!isButtonField(dict)) {
                clearWidgetAppearances(dict);
            } else if (scrubButtonCaption(dict, targets, patterns)) {
                // A button caption (/MK /CA,/RC,/AC) that carried the target renders via /AP that
                // /NeedAppearances can't rebuild, so drop the stale /AP too.
                clearWidgetAppearances(dict);
            }
        } catch (Exception e) {
            log.debug("Failed to scrub field: {}", e.getMessage());
        }
    }

    private static final String[] MK_CAPTION_KEYS = {"CA", "RC", "AC"};

    /** True if a button widget's /MK caption (down/rollover/alternate) contains a target. */
    private static boolean buttonCaptionMatches(
            COSDictionary dict, Set<String> targets, List<Pattern> patterns) {
        for (COSDictionary mk : mkDicts(dict)) {
            for (String k : MK_CAPTION_KEYS) {
                if (dictValueMatches(mk, COSName.getPDFName(k), targets, patterns)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Strip target substrings from a button widget's /MK captions; true if any matched. */
    private static boolean scrubButtonCaption(
            COSDictionary dict, Set<String> targets, List<Pattern> patterns) {
        boolean hit = false;
        for (COSDictionary mk : mkDicts(dict)) {
            for (String k : MK_CAPTION_KEYS) {
                COSName key = COSName.getPDFName(k);
                if (dictValueMatches(mk, key, targets, patterns)) {
                    hit = true;
                    scrubDictStrings(mk, key, targets, patterns);
                }
            }
        }
        return hit;
    }

    /** The /MK appearance-characteristics dicts on a field and any widget kids. */
    private static List<COSDictionary> mkDicts(COSDictionary dict) {
        List<COSDictionary> out = new java.util.ArrayList<>();
        if (dict.getDictionaryObject(COSName.getPDFName("MK")) instanceof COSDictionary mk) {
            out.add(mk);
        }
        if (dict.getDictionaryObject(COSName.KIDS) instanceof COSArray kids) {
            for (int i = 0; i < kids.size(); i++) {
                if (kids.getObject(i) instanceof COSDictionary kid
                        && kid.getDictionaryObject(COSName.getPDFName("MK"))
                                instanceof COSDictionary mk) {
                    out.add(mk);
                }
            }
        }
        return out;
    }

    private static boolean isButtonField(COSDictionary dict) {
        COSBase ftBase = dict.getDictionaryObject(COSName.FT);
        COSName ft = ftBase instanceof COSName n ? n : null;
        if (ft == null) {
            COSBase parent = dict.getDictionaryObject(COSName.PARENT);
            if (parent instanceof COSDictionary p
                    && p.getDictionaryObject(COSName.FT) instanceof COSName pn) {
                ft = pn;
            }
        }
        return COSName.getPDFName("Btn").equals(ft);
    }

    private static boolean dictValueMatches(
            COSDictionary dict, COSName key, Set<String> targets, List<Pattern> patterns) {
        COSBase value = dict.getDictionaryObject(key);
        if (value instanceof COSString cs) {
            return matches(cs.getString(), targets, patterns);
        }
        if (value instanceof COSArray array) {
            for (int i = 0; i < array.size(); i++) {
                if (array.getObject(i) instanceof COSString element
                        && matches(element.getString(), targets, patterns)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean fieldValueMatches(
            PDField field, Set<String> targets, List<Pattern> patterns) {
        try {
            String value = field.getValueAsString();
            return value != null && matches(value, targets, patterns);
        } catch (Exception e) {
            return false;
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

    // Annotations

    private static void scrubAnnotations(
            PDDocument document, Set<String> targets, List<Pattern> patterns) {
        try {
            for (PDPage page : document.getPages()) {
                // Page-level additional actions (/AA - open/close JS) can carry the target too.
                scrubActionIfMatching(
                        page.getCOSObject(), COSName.getPDFName("AA"), targets, patterns);
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
            // Link/widget annotation actions can encode the target in a /URI or JS body.
            scrubActionIfMatching(dict, COSName.A, targets, patterns);
            scrubActionIfMatching(dict, COSName.getPDFName("AA"), targets, patterns);
        } catch (Exception e) {
            log.debug("Failed to scrub annotation: {}", e.getMessage());
        }
    }

    // Structure tree

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
            // Do not walk into content streams - those are handled by content-stream
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

    // Names tree (JavaScript + embedded files)

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
        // Guarded casts: a malformed /Names or /Kids must skip that carrier, not throw a swallowed
        // ClassCastException.
        COSArray namesArray =
                dict.getDictionaryObject(COSName.NAMES) instanceof COSArray a ? a : null;
        if (namesArray != null) {
            Set<String> dropLiterals = carrierDropLiterals(targets);
            for (int i = namesArray.size() - 2; i >= 0; i -= 2) {
                COSBase keyBase = namesArray.getObject(i);
                String key = keyBase instanceof COSString s ? s.getString() : null;
                // Drop the pair when the KEY or the VALUE (JS /JS stream, embedded-file bytes)
                // contains a target - not just the key.
                boolean keyHit = key != null && matches(key, dropLiterals, patterns);
                boolean valueHit =
                        i + 1 < namesArray.size()
                                && containsTarget(
                                        namesArray.getObject(i + 1),
                                        dropLiterals,
                                        patterns,
                                        new HashSet<>());
                if (keyHit || valueHit) {
                    namesArray.remove(i + 1);
                    namesArray.remove(i);
                }
            }
        }
        COSArray kids = dict.getDictionaryObject(COSName.KIDS) instanceof COSArray a ? a : null;
        if (kids != null) {
            for (int i = 0; i < kids.size(); i++) {
                COSBase kid = kids.getObject(i);
                if (kid instanceof COSDictionary kidDict) {
                    scrubNameTreeDict(kidDict, targets, patterns);
                }
            }
        }
    }

    // Helpers

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
                // Case-insensitive literal removal. Verification is case-insensitive
                result = caseInsensitiveReplaceAll(result, target);
            }
        }
        if (patterns != null) {
            for (Pattern pattern : patterns) {
                try {
                    // Force case-insensitive matching for catalog carriers regardless
                    Pattern ci = withCaseInsensitive(pattern);
                    result = ci.matcher(DeadlineCharSequence.of(result)).replaceAll("");
                } catch (RuntimeException | StackOverflowError e) {
                    // Fail closed: a throwing regex means we cannot prove the carrier clean, so
                    // drop the whole string rather than leaving it intact.
                    log.warn("Pattern replace failed for {}; dropping carrier text", pattern);
                    return "";
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
                    if (withCaseInsensitive(pattern)
                            .matcher(DeadlineCharSequence.of(source))
                            .find()) {
                        return true;
                    }
                } catch (RuntimeException | StackOverflowError e) {
                    // Fail closed: a throwing regex counts as a match so the carrier is scrubbed.
                    log.warn("Pattern match failed for {}; treating carrier as a match", pattern);
                    return true;
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
