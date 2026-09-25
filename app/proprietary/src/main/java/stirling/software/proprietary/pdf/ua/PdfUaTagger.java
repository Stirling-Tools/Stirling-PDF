package stirling.software.proprietary.pdf.ua;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureElement;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;

import lombok.extern.slf4j.Slf4j;

/**
 * Tags an untagged PDF and applies the document-level PDF/UA requirements. Content must be marked
 * before the tree can reference it, and conformance is declared elsewhere, only after validation.
 */
@Slf4j
public class PdfUaTagger {

    private final TaggedContentExtractor extractor = new TaggedContentExtractor();
    private final LayoutAnalyzer analyzer = new LayoutAnalyzer();
    private final MarkedContentInjector injector = new MarkedContentInjector();
    private final PdfUaMetadataWriter metadataWriter = new PdfUaMetadataWriter();

    public TaggingResult tag(PDDocument document, TaggingOptions options) throws IOException {
        boolean alreadyTagged = hasUsableStructureTree(document);
        boolean rebuild =
                switch (options.getExistingTags()) {
                    case KEEP -> false;
                    case REBUILD -> true;
                    case AUTO -> !alreadyTagged;
                };

        List<String> languageWarnings = new ArrayList<>();
        String language = resolveLanguage(document, options, languageWarnings);

        if (!rebuild) {
            log.info("Keeping existing structure tree; applying document requirements only");
            DocumentStructure kept = new DocumentStructure();
            languageWarnings.forEach(kept::warn);
            metadataWriter
                    .applyDocumentRequirements(
                            document,
                            options.getTitle(),
                            language,
                            options.getProfile(),
                            options.isPreservePdfVersion())
                    .forEach(kept::warn);
            return new TaggingResult(kept, false);
        }

        // Types the old tree carried, so a rebuild that cannot reproduce them can say so. Font
        // embedding may already have deleted the tree, so fall back to what the source had.
        Set<String> discardedTypes =
                alreadyTagged
                        ? structureTypes(document)
                        : options.getSourceFacts().structureTypes();

        if (alreadyTagged) {
            stripStructure(document);
        }

        List<PageContent> pages = extractor.extract(document);
        DocumentStructure structure = analyzer.analyse(pages);
        structure.setLanguage(language);
        languageWarnings.forEach(structure::warn);
        applyFigurePolicy(structure, options);

        if (structure.isEmpty()) {
            structure.warn(
                    "No taggable content was found; the document may be a scan with no text layer.");
        }

        injectMarkedContent(document, structure, pages);
        new StructTreeWriter().write(document, structure, options.getProfile());
        // Losing the tree to the embedder is a different problem from a requested rebuild, and
        // the advice that helps differs too, so tell them apart.
        boolean lostToEmbedder = !alreadyTagged && options.getSourceFacts().hasUsableTree();
        warnAboutFlattenedStructure(
                discardedTypes, structureTypes(document), structure, lostToEmbedder);

        String title = resolveTitle(options, structure);
        if (title == null) {
            structure.warn(
                    "No document title could be derived. PDF/UA requires one, so supply a title.");
        }
        metadataWriter
                .applyDocumentRequirements(
                        document,
                        title,
                        language,
                        options.getProfile(),
                        options.isPreservePdfVersion())
                .forEach(structure::warn);

        return new TaggingResult(structure, true);
    }

    /**
     * Keeps the language the document already declares. Overwriting it relabels, say, a French file
     * as English, and no validator can catch that.
     */
    private static String resolveLanguage(
            PDDocument document, TaggingOptions options, List<String> warnings) {
        String existing = document.getDocumentCatalog().getLanguage();
        if (existing == null || existing.isBlank()) {
            // Font embedding discards /Lang, so without this a rewritten French document would
            // silently take the caller's default language.
            existing = options.getSourceFacts().language();
        }
        String requested = options.getLanguage();
        if (existing == null || existing.isBlank() || options.isOverrideLanguage()) {
            return requested;
        }
        if (requested != null && !requested.isBlank() && !requested.equalsIgnoreCase(existing)) {
            warnings.add(
                    "The document already declares its language as '"
                            + existing
                            + "', so the requested '"
                            + requested
                            + "' was ignored. Ask to override the language to change it.");
        }
        return existing;
    }

    /** Explicit title first, then the first heading, then the caller's fallback. */
    private static String resolveTitle(TaggingOptions options, DocumentStructure structure) {
        for (String candidate :
                new String[] {
                    options.getTitle(), structure.getTitle(), options.getFallbackTitle()
                }) {
            if (candidate != null && !candidate.isBlank()) {
                return candidate.strip();
            }
        }
        return null;
    }

    /** Writes the conformance declaration. Separate from tagging so validation can gate it. */
    public void declareConformance(PDDocument document, PdfUaProfile profile) throws IOException {
        metadataWriter.declareConformance(document, profile);
    }

    /** Withdraws the conformance claim, for a document that turned out not to validate. */
    public void withdrawConformance(PDDocument document) throws IOException {
        metadataWriter.removeConformanceDeclaration(document);
    }

    /** Wraps content page by page; marked content ids restart on each page. */
    private void injectMarkedContent(
            PDDocument document, DocumentStructure structure, List<PageContent> pages)
            throws IOException {
        Map<Integer, Integer> markableCounts = new LinkedHashMap<>();
        pages.forEach(page -> markableCounts.put(page.pageIndex(), page.markableCount()));
        Map<Integer, List<StructBlock>> byPage = new LinkedHashMap<>();
        for (StructBlock block : structure.getBlocks()) {
            byPage.computeIfAbsent(block.getPageIndex(), k -> new ArrayList<>()).add(block);
        }
        for (int pageIndex = 0; pageIndex < document.getNumberOfPages(); pageIndex++) {
            List<StructBlock> blocks = byPage.getOrDefault(pageIndex, List.of());
            // Nothing to wrap, and rewriting costs a parse and recompress for an identical stream.
            if (blocks.isEmpty() && markableCounts.getOrDefault(pageIndex, 0) == 0) {
                continue;
            }
            injector.inject(document, document.getPage(pageIndex), blocks, 0, true);
        }
    }

    /** Applies alt text supplied by the caller, or demotes images to artifacts on request. */
    private static void applyFigurePolicy(DocumentStructure structure, TaggingOptions options) {
        int[] suppressed = {0};
        structure.visit(
                block -> {
                    if (block.getType() != StructType.FIGURE) {
                        return;
                    }
                    if (options.getFigurePolicy() == TaggingOptions.FigurePolicy.MARK_DECORATIVE) {
                        block.setType(StructType.ARTIFACT);
                        block.setArtifactType(ArtifactType.LAYOUT);
                        suppressed[0]++;
                        return;
                    }
                    int ordinal =
                            block.getRanges().isEmpty() ? -1 : block.getRanges().get(0).start();
                    String alt = options.altTextFor(block.getPageIndex(), ordinal);
                    if (alt != null && !alt.isBlank()) {
                        block.setAlt(alt);
                    }
                });
        // Marking images decorative validates by hiding content, so never report it as clean.
        if (suppressed[0] > 0) {
            structure.warn(
                    suppressed[0]
                            + " image(s) were marked as decoration and are now hidden from"
                            + " assistive technology. Confirm none of them carried meaning.");
        }
        int missing = structure.figuresWithoutAlt().size();
        if (missing > 0) {
            structure.warn(
                    missing
                            + " figure(s) have no alternative description. PDF/UA requires one for"
                            + " every image that carries meaning.");
        }
    }

    /**
     * A tree is only worth keeping when wired up: kids, a parent tree, and a marked catalog.
     * Keeping one that fails any of those leaves the document permanently unfixable.
     */
    public static boolean hasUsableStructureTree(PDDocument document) {
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        PDStructureTreeRoot root = catalog.getStructureTreeRoot();
        if (root == null) {
            return false;
        }
        try {
            boolean hasKids = root.getKids() != null && !root.getKids().isEmpty();
            boolean hasParentTree = root.getParentTree() != null;
            boolean marked = catalog.getMarkInfo() != null && catalog.getMarkInfo().isMarked();
            return hasKids && hasParentTree && marked;
        } catch (RuntimeException e) {
            log.debug("Unreadable structure tree, treating as absent: {}", e.getMessage());
            return false;
        }
    }

    /**
     * A rebuild derives structure from layout, so semantics the old tree carried can vanish - a
     * table becomes loose paragraphs. Validators cannot see that loss, so it has to be reported.
     */
    private static void warnAboutFlattenedStructure(
            Set<String> before,
            Set<String> after,
            DocumentStructure structure,
            boolean lostToEmbedder) {
        List<String> lost =
                MEANINGFUL_TYPES.stream()
                        .filter(type -> before.contains(type) && !after.contains(type))
                        .toList();
        if (lost.isEmpty()) {
            return;
        }
        // Keeping the tags cannot help once the embedder has deleted them, so do not suggest it.
        String remedy =
                lostToEmbedder
                        ? " Embedding the missing fonts rewrote the document and deleted its"
                                + " original tags. Turn off font embedding to keep them."
                        : " Keep the existing tags instead to preserve it.";
        structure.warn(
                "Rebuilding the tags could not reproduce "
                        + String.join(", ", lost)
                        + " structure, so that content is now plain paragraphs."
                        + remedy);
    }

    /** Structure whose loss changes what a screen reader conveys, not just how it is nested. */
    private static final List<String> MEANINGFUL_TYPES =
            List.of("Table", "TH", "Formula", "L", "LI", "TOC", "Note");

    private static Set<String> structureTypes(PDDocument document) {
        Set<String> types = new HashSet<>();
        try {
            PDStructureTreeRoot root = document.getDocumentCatalog().getStructureTreeRoot();
            if (root != null) {
                collectTypes(root.getKids(), types, 0);
            }
        } catch (RuntimeException e) {
            log.debug("Could not read structure types: {}", e.getMessage());
        }
        return types;
    }

    private static void collectTypes(Object node, Set<String> types, int depth) {
        // Structure trees can be deep or, in damaged files, cyclic; cap rather than overflow.
        if (node == null || depth > 64) {
            return;
        }
        if (node instanceof List<?> list) {
            list.forEach(child -> collectTypes(child, types, depth + 1));
        } else if (node instanceof PDStructureElement element) {
            types.add(element.getStructureType());
            collectTypes(element.getKids(), types, depth + 1);
        }
    }

    private static void stripStructure(PDDocument document) {
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        catalog.getCOSObject().removeItem(COSName.getPDFName("StructTreeRoot"));
        catalog.getCOSObject().removeItem(COSName.getPDFName("MarkInfo"));
        document.getPages()
                .forEach(
                        page ->
                                page.getCOSObject()
                                        .removeItem(COSName.getPDFName("StructParents")));
        log.info("Removed existing structure tree before rebuilding");
    }
}
