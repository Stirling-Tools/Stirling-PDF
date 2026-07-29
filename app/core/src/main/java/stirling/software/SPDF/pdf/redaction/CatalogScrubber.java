package stirling.software.SPDF.pdf.redaction;

import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
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
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.PDNameTreeNode;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.utils.text.TextFinderUtils;

/** Removes/rewrites every catalog carrier that could leak redacted text. */
@Slf4j
public final class CatalogScrubber {

    // A literal shorter than this won't delete a whole carrier (JS/XFA/action/embedded file).
    static final int MIN_CARRIER_DROP_LITERAL = 3;

    // Regexes can't be window-scanned, so they only see this much of a stream; literals scan
    // the whole stream in a sliding window and have no size limit.
    private static final int MAX_STREAM_PATTERN_CHARS = 2 * 1024 * 1024;
    private static final int STREAM_CHUNK_CHARS = 64 * 1024;

    // Bounds recursive walks so a crafted deep or cyclic object graph can't blow the stack.
    private static final int MAX_WALK_DEPTH = 100;

    private static final COSName AA = COSName.getPDFName("AA");
    private static final COSName OPEN_ACTION = COSName.getPDFName("OpenAction");
    private static final COSName ACTUAL_TEXT = COSName.getPDFName("ActualText");
    private static final COSName ALT = COSName.getPDFName("Alt");
    private static final COSName ATTR_E = COSName.getPDFName("E");
    private static final COSName TITLE_T = COSName.getPDFName("T");
    private static final COSName LANG = COSName.getPDFName("Lang");
    private static final COSName RC = COSName.getPDFName("RC");
    private static final COSName SUBJ = COSName.getPDFName("Subj");
    private static final COSName NM = COSName.getPDFName("NM");
    private static final COSName RV = COSName.getPDFName("RV");
    private static final COSName TU = COSName.getPDFName("TU");
    private static final COSName MK = COSName.getPDFName("MK");
    private static final COSName REF = COSName.getPDFName("Ref");
    private static final COSName WIDGET = COSName.getPDFName("Widget");
    private static final COSName BTN = COSName.getPDFName("Btn");

    private CatalogScrubber() {}

    /** Scrub all catalog-level carriers of the given literal/regex targets. */
    public static void scrub(
            PDDocument document, Set<String> literalTargets, List<Pattern> patterns) {
        scrub(document, literalTargets, patterns, false);
    }

    /**
     * boundaryLiterals=true matches literals only at word boundaries: area-captured tokens are
     * fuzzy, and substring-stripping a token like "the" would mangle every unrelated carrier.
     */
    public static void scrub(
            PDDocument document,
            Set<String> literalTargets,
            List<Pattern> patterns,
            boolean boundaryLiterals) {
        if (document == null) {
            return;
        }
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        if (catalog == null) {
            return;
        }
        CompiledTargets ct = CompiledTargets.compile(literalTargets, patterns, boundaryLiterals);
        if (ct.isEmpty()) {
            return;
        }

        try (DeadlineCharSequence.BudgetScope scope = DeadlineCharSequence.armSharedBudget()) {
            scrubOutline(catalog.getDocumentOutline(), ct);
            scrubAcroForm(catalog.getAcroForm(), ct);
            scrubAnnotations(document, ct);
            scrubStructTree(catalog.getStructureTreeRoot(), ct);
            scrubNames(catalog.getNames(), ct);
            scrubCatalogActions(catalog, ct);
            scrubDocumentInfo(document, ct);
        }
    }

    /** Targets compiled once per scrub; per-carrier Pattern.compile was the scrub hot spot. */
    private static final class CompiledTargets {
        final List<LiteralTarget> literals = new ArrayList<>();
        final List<Pattern> patterns = new ArrayList<>();

        static CompiledTargets compile(
                Set<String> literalTargets, List<Pattern> rawPatterns, boolean boundary) {
            CompiledTargets ct = new CompiledTargets();
            if (literalTargets != null) {
                for (String target : literalTargets) {
                    if (target == null || target.isEmpty()) {
                        continue;
                    }
                    ct.literals.add(new LiteralTarget(target, boundary));
                }
            }
            if (rawPatterns != null) {
                for (Pattern pattern : rawPatterns) {
                    if (pattern != null) {
                        ct.patterns.add(withCaseInsensitive(pattern));
                    }
                }
            }
            return ct;
        }

        boolean isEmpty() {
            return literals.isEmpty() && patterns.isEmpty();
        }

        boolean hasDroppableTargets() {
            if (!patterns.isEmpty()) {
                return true;
            }
            for (LiteralTarget lt : literals) {
                if (lt.droppable) {
                    return true;
                }
            }
            return false;
        }

        /** Sliding-window overlap needed so no droppable-literal match spans a chunk seam. */
        int maxDropWindowSpan() {
            int span = 0;
            for (LiteralTarget lt : literals) {
                if (lt.droppable) {
                    span = Math.max(span, lt.windowSpan);
                }
            }
            return span;
        }
    }

    private static final class LiteralTarget {
        final String lower;
        final Pattern strip;
        final boolean boundary;
        final boolean droppable;
        final int windowSpan;

        LiteralTarget(String target, boolean boundary) {
            this.lower = target.toLowerCase(Locale.ROOT);
            this.boundary = boundary;
            String core = Pattern.quote(target);
            if (boundary) {
                core = TextFinderUtils.applyWordBoundaries(target, core);
            }
            this.strip = Pattern.compile(core, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
            this.droppable = target.trim().length() >= MIN_CARRIER_DROP_LITERAL;
            // +2 keeps one lookaround context char on each side inside the window.
            this.windowSpan = target.length() + 2;
        }

        boolean hits(String source, String lowerSource) {
            if (boundary) {
                try {
                    return strip.matcher(DeadlineCharSequence.of(source)).find();
                } catch (RuntimeException | StackOverflowError e) {
                    return true; // fail closed
                }
            }
            return lowerSource.contains(lower);
        }
    }

    // Catalog actions: OpenAction, AA, and any JavaScript / URI payloads

    private static void scrubCatalogActions(PDDocumentCatalog catalog, CompiledTargets ct) {
        COSDictionary root = catalog.getCOSObject();
        if (root == null) {
            return;
        }
        // OpenAction may be either an action dict (with /URI or /JS) or an explicit
        scrubActionIfMatching(root, OPEN_ACTION, ct);
        scrubActionIfMatching(root, AA, ct);
    }

    /** Drop the action at key if any target appears in its URI/JS payload. */
    private static void scrubActionIfMatching(
            COSDictionary parent, COSName key, CompiledTargets ct) {
        if (parent == null || key == null) {
            return;
        }
        COSBase value = parent.getDictionaryObject(key);
        if (value == null) {
            return;
        }
        if (containsTarget(value, ct, new HashSet<>(), 0)) {
            log.debug("Removing catalog {} due to target match", key.getName());
            parent.removeItem(key);
        }
    }

    /**
     * True when the value's object graph carries a target that is specific enough to justify
     * deleting the whole carrier: droppable literals (>= {@link #MIN_CARRIER_DROP_LITERAL}) or any
     * regex pattern. Fails closed on unreadable content and over-deep graphs.
     */
    private static boolean containsTarget(
            COSBase base, CompiledTargets ct, Set<COSBase> seen, int depth) {
        if (base == null || !ct.hasDroppableTargets()) {
            return false;
        }
        if (depth > MAX_WALK_DEPTH) {
            return true; // too deep to prove clean
        }
        COSBase resolved = base instanceof COSObject obj ? obj.getObject() : base;
        if (resolved == null || !seen.add(resolved)) {
            return false;
        }
        if (resolved instanceof COSString cs) {
            return matches(cs.getString(), ct, true);
        }
        if (resolved instanceof COSStream stream) {
            // Streams in XFA / OpenAction contexts are text (XML, JavaScript).
            return streamContainsTarget(stream, ct);
        }
        if (resolved instanceof COSDictionary dict) {
            for (COSName k : dict.keySet()) {
                if (containsTarget(dict.getItem(k), ct, seen, depth + 1)) {
                    return true;
                }
            }
            return false;
        }
        if (resolved instanceof COSArray array) {
            for (int i = 0; i < array.size(); i++) {
                if (containsTarget(array.getObject(i), ct, seen, depth + 1)) {
                    return true;
                }
            }
            return false;
        }
        return false;
    }

    /**
     * Scans the whole stream for droppable literals with a sliding window (no size limit, bounded
     * memory), so a large but clean carrier - a 5 MB attachment, a big XFA packet - is no longer
     * dropped just for its size. Regexes can't be window-scanned: they see the first {@link
     * #MAX_STREAM_PATTERN_CHARS} and anything beyond stays unproven (treated as a match).
     */
    private static boolean streamContainsTarget(COSStream stream, CompiledTargets ct) {
        int windowSpan = ct.maxDropWindowSpan();
        boolean scanLiterals = windowSpan > 0;
        boolean scanPatterns = !ct.patterns.isEmpty();
        if (!scanLiterals && !scanPatterns) {
            return false;
        }
        try (Reader reader =
                new InputStreamReader(stream.createInputStream(), StandardCharsets.UTF_8)) {
            char[] chunk = new char[STREAM_CHUNK_CHARS];
            StringBuilder patternPrefix = scanPatterns ? new StringBuilder() : null;
            String tail = "";
            long totalChars = 0;
            int n;
            while ((n = reader.read(chunk)) > 0) {
                totalChars += n;
                if (scanLiterals) {
                    String window = tail + new String(chunk, 0, n);
                    String lowerWindow = window.toLowerCase(Locale.ROOT);
                    for (LiteralTarget lt : ct.literals) {
                        if (lt.droppable && lt.hits(window, lowerWindow)) {
                            return true;
                        }
                    }
                    int keep = Math.min(window.length(), windowSpan);
                    tail = window.substring(window.length() - keep);
                }
                if (patternPrefix != null && patternPrefix.length() < MAX_STREAM_PATTERN_CHARS) {
                    int room = MAX_STREAM_PATTERN_CHARS - patternPrefix.length();
                    patternPrefix.append(chunk, 0, Math.min(n, room));
                }
            }
            if (patternPrefix != null) {
                if (matches(patternPrefix.toString(), ct, true)) {
                    return true;
                }
                if (totalChars > patternPrefix.length()) {
                    return true; // pattern targets exist but part of the stream went unscanned
                }
            }
            return false;
        } catch (Exception e) {
            log.debug("Failed to scan stream for targets: {}", e.getMessage());
            // Fail closed: if we cannot read it we cannot prove it is clean.
            return true;
        }
    }

    /**
     * Remove the redaction target from /Info string entries and drop the XMP packet only if it
     * carries a target. Non-matching document properties (Title, Author, dates) are left intact -
     * redaction removes the target, it does not blanket-wipe metadata.
     */
    private static void scrubDocumentInfo(PDDocument document, CompiledTargets ct) {
        PDDocumentInformation info = document.getDocumentInformation();
        if (info != null && info.getCOSObject() != null) {
            COSDictionary infoDict = info.getCOSObject();
            for (COSName key : new HashSet<>(infoDict.keySet())) {
                if (infoDict.getDictionaryObject(key) instanceof COSString cs) {
                    String stripped = stripMatches(cs.getString(), ct);
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
            scrubXmp(document, catalog, ct);
        }
    }

    /**
     * XMP is RDF/XML that usually mirrors /Info. Strip only the target occurrences so non-matching
     * properties (dates, rights, custom schema) survive; fall back to dropping the whole packet if
     * the edit can't be proven to have removed the target (e.g. entity-encoded) or anything throws.
     */
    private static void scrubXmp(
            PDDocument document, PDDocumentCatalog catalog, CompiledTargets ct) {
        String xmp;
        try {
            xmp = new String(catalog.getMetadata().toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.debug("Could not read XMP metadata: {}", e.getMessage());
            return;
        }
        if (!matches(xmp, ct, false)) {
            return;
        }
        try {
            String stripped = stripMatches(xmp, ct);
            // Only keep the edited packet if the target is provably gone from it.
            if (!matches(stripped, ct, false)) {
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

    private static void scrubOutline(PDDocumentOutline outline, CompiledTargets ct) {
        if (outline == null) {
            return;
        }
        scrubOutlineItems(outline.children(), ct, new HashSet<>(), 0);
    }

    private static void scrubOutlineItems(
            Iterable<PDOutlineItem> items, CompiledTargets ct, Set<COSBase> seen, int depth) {
        if (items == null || depth > MAX_WALK_DEPTH) {
            return;
        }
        for (PDOutlineItem item : items) {
            try {
                // A cyclic /First chain must not recurse forever.
                if (item.getCOSObject() == null || !seen.add(item.getCOSObject())) {
                    continue;
                }
                String title = item.getTitle();
                if (title != null) {
                    String stripped = stripMatches(title, ct);
                    if (!stripped.equals(title)) {
                        item.setTitle(stripped);
                    }
                }
                // Bookmark actions: /A is an action dict which may carry a /URI or /JS
                COSDictionary itemDict = item.getCOSObject();
                if (itemDict != null) {
                    scrubActionIfMatching(itemDict, COSName.A, ct);
                    scrubActionIfMatching(itemDict, AA, ct);
                }
                scrubOutlineItems(item.children(), ct, seen, depth + 1);
            } catch (Exception e) {
                log.debug("Failed to scrub outline item: {}", e.getMessage());
            }
        }
    }

    // AcroForm

    private static void scrubAcroForm(PDAcroForm form, CompiledTargets ct) {
        if (form == null) {
            return;
        }
        // XFA forms: scrubbed separately because the XFA XML packet carries
        scrubXfa(form, ct);

        boolean anyFieldModified = false;
        try {
            for (PDField field : form.getFieldTree()) {
                anyFieldModified |= scrubField(field, ct);
            }
        } catch (Exception e) {
            log.debug("Failed to walk AcroForm field tree: {}", e.getMessage());
        }

        // Force viewers to regenerate appearance streams from the scrubbed /V - but only when
        // something changed, or every untouched form would get its appearances rebuilt.
        if (anyFieldModified) {
            try {
                form.setNeedAppearances(true);
            } catch (Exception e) {
                log.debug("Failed to set /NeedAppearances on AcroForm: {}", e.getMessage());
            }
        }
    }

    private static void scrubXfa(PDAcroForm form, CompiledTargets ct) {
        try {
            COSBase xfaBase = form.getCOSObject().getDictionaryObject(COSName.XFA);
            if (xfaBase == null) {
                return;
            }
            if (containsTarget(xfaBase, ct, new HashSet<>(), 0)) {
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

    /** Returns true when the field carried a target and was modified. */
    private static boolean scrubField(PDField field, CompiledTargets ct) {
        if (field == null) {
            return false;
        }
        try {
            COSDictionary dict = field.getCOSObject();
            // Only touch fields whose own values actually contain a target: clearing /AP
            // document-wide blanks unrelated fields in viewers that ignore /NeedAppearances.
            boolean matched =
                    dictValueMatches(dict, COSName.V, ct)
                            || dictValueMatches(dict, COSName.DV, ct)
                            || dictValueMatches(dict, RV, ct)
                            || dictValueMatches(dict, TU, ct)
                            || buttonCaptionMatches(dict, ct)
                            || fieldValueMatches(field, ct);
            if (!matched) {
                return false;
            }
            scrubDictStrings(dict, COSName.V, ct);
            scrubDictStrings(dict, COSName.DV, ct);
            scrubDictStrings(dict, RV, ct);
            scrubDictStrings(dict, TU, ct);
            // Keep field appearance streams in sync with value where possible.
            try {
                if (field.getValueAsString() != null) {
                    String stripped = stripMatches(field.getValueAsString(), ct);
                    if (!stripped.equals(field.getValueAsString())) {
                        field.setValue(stripped);
                    }
                }
            } catch (Exception e) {
                log.debug("Failed to rewrite field value via setValue: {}", e.getMessage());
            }
            if (!isButtonField(dict)) {
                clearWidgetAppearances(dict);
            } else if (scrubButtonCaption(dict, ct)) {
                // A button caption (/MK /CA,/RC,/AC) that carried the target renders via /AP that
                // /NeedAppearances can't rebuild, so drop the stale /AP too.
                clearWidgetAppearances(dict);
            }
            return true;
        } catch (Exception e) {
            log.debug("Failed to scrub field: {}", e.getMessage());
            return false;
        }
    }

    private static final String[] MK_CAPTION_KEYS = {"CA", "RC", "AC"};

    /** True if a button widget's /MK caption (down/rollover/alternate) contains a target. */
    private static boolean buttonCaptionMatches(COSDictionary dict, CompiledTargets ct) {
        for (COSDictionary mk : mkDicts(dict)) {
            for (String k : MK_CAPTION_KEYS) {
                if (dictValueMatches(mk, COSName.getPDFName(k), ct)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Strip target substrings from a button widget's /MK captions; true if any matched. */
    private static boolean scrubButtonCaption(COSDictionary dict, CompiledTargets ct) {
        boolean hit = false;
        for (COSDictionary mk : mkDicts(dict)) {
            for (String k : MK_CAPTION_KEYS) {
                COSName key = COSName.getPDFName(k);
                if (dictValueMatches(mk, key, ct)) {
                    hit = true;
                    scrubDictStrings(mk, key, ct);
                }
            }
        }
        return hit;
    }

    /** The /MK appearance-characteristics dicts on a field and any widget kids. */
    private static List<COSDictionary> mkDicts(COSDictionary dict) {
        List<COSDictionary> out = new ArrayList<>();
        if (dict.getDictionaryObject(MK) instanceof COSDictionary mk) {
            out.add(mk);
        }
        if (dict.getDictionaryObject(COSName.KIDS) instanceof COSArray kids) {
            for (int i = 0; i < kids.size(); i++) {
                if (kids.getObject(i) instanceof COSDictionary kid
                        && kid.getDictionaryObject(MK) instanceof COSDictionary mk) {
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
        return BTN.equals(ft);
    }

    private static boolean dictValueMatches(COSDictionary dict, COSName key, CompiledTargets ct) {
        COSBase value = dict.getDictionaryObject(key);
        if (value instanceof COSString cs) {
            return matches(cs.getString(), ct, false);
        }
        if (value instanceof COSArray array) {
            for (int i = 0; i < array.size(); i++) {
                if (array.getObject(i) instanceof COSString element
                        && matches(element.getString(), ct, false)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean fieldValueMatches(PDField field, CompiledTargets ct) {
        try {
            String value = field.getValueAsString();
            return value != null && matches(value, ct, false);
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

    private static void scrubAnnotations(PDDocument document, CompiledTargets ct) {
        try {
            for (PDPage page : document.getPages()) {
                // Page-level additional actions (/AA - open/close JS) can carry the target too.
                scrubActionIfMatching(page.getCOSObject(), AA, ct);
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
                    scrubAnnotation(annotation, ct);
                }
            }
        } catch (Exception e) {
            log.debug("Annotation scrub walk failed: {}", e.getMessage());
        }
    }

    private static void scrubAnnotation(PDAnnotation annotation, CompiledTargets ct) {
        if (annotation == null) {
            return;
        }
        try {
            String contents = annotation.getContents();
            if (contents != null) {
                String stripped = stripMatches(contents, ct);
                if (!stripped.equals(contents)) {
                    annotation.setContents(stripped);
                }
            }
            COSDictionary dict = annotation.getCOSObject();
            scrubDictStrings(dict, RC, ct);
            scrubDictStrings(dict, SUBJ, ct);
            if (!WIDGET.equals(dict.getDictionaryObject(COSName.SUBTYPE))) {
                // /T is the author on markup annotations, but the FIELD NAME on widgets -
                // rewriting a field name breaks getField()/JS lookups, so leave widgets alone.
                scrubDictStrings(dict, TITLE_T, ct);
            }
            scrubDictStrings(dict, NM, ct);
            // Link/widget annotation actions can encode the target in a /URI or JS body.
            scrubActionIfMatching(dict, COSName.A, ct);
            scrubActionIfMatching(dict, AA, ct);
        } catch (Exception e) {
            log.debug("Failed to scrub annotation: {}", e.getMessage());
        }
    }

    // Structure tree

    private static void scrubStructTree(PDStructureTreeRoot root, CompiledTargets ct) {
        if (root == null) {
            return;
        }
        try {
            scrubStructDict(root.getCOSObject(), ct, new HashSet<>(), 0);
        } catch (Exception e) {
            log.debug("Structure tree scrub failed: {}", e.getMessage());
        }
    }

    private static void scrubStructDict(
            COSBase base, CompiledTargets ct, Set<COSBase> seen, int depth) {
        if (base == null || depth > MAX_WALK_DEPTH) {
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
            scrubDictStrings(dict, ACTUAL_TEXT, ct);
            scrubDictStrings(dict, ALT, ct);
            scrubDictStrings(dict, ATTR_E, ct);
            scrubDictStrings(dict, TITLE_T, ct);
            scrubDictStrings(dict, LANG, ct);
            // Recurse only along the struct graph (/K children, /A attributes, /Ref):
            // following /Pg or /P would walk pages, widgets and fonts - the whole document.
            scrubStructDict(dict.getItem(COSName.K), ct, seen, depth + 1);
            scrubStructDict(dict.getItem(COSName.A), ct, seen, depth + 1);
            scrubStructDict(dict.getItem(REF), ct, seen, depth + 1);
        } else if (resolved instanceof COSArray array) {
            for (int i = 0; i < array.size(); i++) {
                scrubStructDict(array.getObject(i), ct, seen, depth + 1);
            }
        }
    }

    // Names tree (JavaScript + embedded files)

    private static void scrubNames(PDDocumentNameDictionary names, CompiledTargets ct) {
        if (names == null) {
            return;
        }
        try {
            dropMatchingNames(names.getJavaScript(), ct);
        } catch (Exception e) {
            log.debug("Failed to scrub JavaScript names: {}", e.getMessage());
        }
        try {
            dropMatchingNames(names.getEmbeddedFiles(), ct);
        } catch (Exception e) {
            log.debug("Failed to scrub embedded-file names: {}", e.getMessage());
        }
    }

    private static void dropMatchingNames(PDNameTreeNode<?> node, CompiledTargets ct) {
        if (node == null) {
            return;
        }
        COSDictionary dict = node.getCOSObject();
        if (dict == null) {
            return;
        }
        scrubNameTreeDict(dict, ct, new HashSet<>(), 0);
    }

    private static void scrubNameTreeDict(
            COSDictionary dict, CompiledTargets ct, Set<COSBase> seen, int depth) {
        // A /Kids entry pointing back at an ancestor must not recurse forever.
        if (dict == null || depth > MAX_WALK_DEPTH || !seen.add(dict)) {
            return;
        }
        // Guarded casts: a malformed /Names or /Kids must skip that carrier, not throw a swallowed
        // ClassCastException.
        COSArray namesArray =
                dict.getDictionaryObject(COSName.NAMES) instanceof COSArray a ? a : null;
        if (namesArray != null) {
            for (int i = namesArray.size() - 2; i >= 0; i -= 2) {
                COSBase keyBase = namesArray.getObject(i);
                String key = keyBase instanceof COSString s ? s.getString() : null;
                // Drop the pair when the KEY or the VALUE (JS /JS stream, embedded-file bytes)
                // contains a target - not just the key.
                boolean keyHit = key != null && matches(key, ct, true);
                boolean valueHit =
                        i + 1 < namesArray.size()
                                && containsTarget(
                                        namesArray.getObject(i + 1), ct, new HashSet<>(), 0);
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
                    scrubNameTreeDict(kidDict, ct, seen, depth + 1);
                }
            }
        }
    }

    // Helpers

    private static void scrubDictStrings(COSDictionary dict, COSName key, CompiledTargets ct) {
        if (dict == null || key == null) {
            return;
        }
        COSBase value = dict.getDictionaryObject(key);
        if (value instanceof COSString cosString) {
            String stripped = stripMatches(cosString.getString(), ct);
            if (!stripped.equals(cosString.getString())) {
                dict.setString(key, stripped);
            }
        } else if (value instanceof COSArray array) {
            for (int i = 0; i < array.size(); i++) {
                COSBase element = array.getObject(i);
                if (element instanceof COSString elementString) {
                    String stripped = stripMatches(elementString.getString(), ct);
                    if (!stripped.equals(elementString.getString())) {
                        array.set(i, new COSString(stripped));
                    }
                }
            }
        }
    }

    /** Test-visible compatibility wrapper; compiles targets per call. */
    static String stripMatches(String source, Set<String> literalTargets, List<Pattern> patterns) {
        return stripMatches(source, CompiledTargets.compile(literalTargets, patterns, false));
    }

    private static String stripMatches(String source, CompiledTargets ct) {
        if (source == null || source.isEmpty()) {
            return source;
        }
        String result = source;
        for (LiteralTarget lt : ct.literals) {
            try {
                result = lt.strip.matcher(DeadlineCharSequence.of(result)).replaceAll("");
            } catch (RuntimeException | StackOverflowError e) {
                log.warn("Literal strip failed for a target; dropping carrier text");
                return "";
            }
        }
        for (Pattern pattern : ct.patterns) {
            try {
                result = pattern.matcher(DeadlineCharSequence.of(result)).replaceAll("");
            } catch (RuntimeException | StackOverflowError e) {
                // Fail closed: a throwing regex means we cannot prove the carrier clean, so
                // drop the whole string rather than leaving it intact.
                log.warn("Pattern replace failed for {}; dropping carrier text", pattern);
                return "";
            }
        }
        return result;
    }

    /** dropOnly=true restricts literals to those specific enough to delete a whole carrier. */
    private static boolean matches(String source, CompiledTargets ct, boolean dropOnly) {
        if (source == null || source.isEmpty()) {
            return false;
        }
        String lower = null;
        for (LiteralTarget lt : ct.literals) {
            if (dropOnly && !lt.droppable) {
                continue;
            }
            if (!lt.boundary && lower == null) {
                lower = source.toLowerCase(Locale.ROOT);
            }
            if (lt.hits(source, lower)) {
                return true;
            }
        }
        for (Pattern pattern : ct.patterns) {
            try {
                if (pattern.matcher(DeadlineCharSequence.of(source)).find()) {
                    return true;
                }
            } catch (RuntimeException | StackOverflowError e) {
                // Fail closed: a throwing regex counts as a match so the carrier is scrubbed.
                log.warn("Pattern match failed for {}; treating carrier as a match", pattern);
                return true;
            }
        }
        return false;
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
