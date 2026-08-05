package stirling.software.common.pdf.ua;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;

import lombok.extern.slf4j.Slf4j;

/**
 * Turns an untagged PDF into a tagged one and applies the document-level PDF/UA requirements.
 *
 * <p>Order matters: content must be marked before the structure tree can reference it, and the
 * conformance declaration is deliberately not written here. Callers declare conformance only after
 * validating the result, so a file never claims PDF/UA on the strength of intent alone.
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

        if (!rebuild) {
            log.info("Keeping existing structure tree; applying document requirements only");
            DocumentStructure kept = new DocumentStructure();
            metadataWriter
                    .applyDocumentRequirements(
                            document,
                            options.getTitle(),
                            options.getLanguage(),
                            options.getProfile())
                    .forEach(kept::warn);
            return new TaggingResult(kept, false);
        }

        if (alreadyTagged) {
            stripStructure(document);
        }

        List<PageContent> pages = extractor.extract(document);
        DocumentStructure structure = analyzer.analyse(pages);
        structure.setLanguage(options.getLanguage());
        applyFigurePolicy(structure, options);

        if (structure.isEmpty()) {
            structure.warn(
                    "No taggable content was found; the document may be a scan with no text layer.");
        }

        injectMarkedContent(document, structure, pages);
        new StructTreeWriter().write(document, structure, options.getProfile());

        String title = resolveTitle(options, structure);
        if (title == null) {
            structure.warn(
                    "No document title could be derived. PDF/UA requires one, so supply a title.");
        }
        metadataWriter
                .applyDocumentRequirements(
                        document,
                        title,
                        options.getLanguage(),
                        options.getProfile(),
                        options.isPreservePdfVersion())
                .forEach(structure::warn);

        return new TaggingResult(structure, true);
    }

    /**
     * Explicit title first, then the first heading, then whatever the caller offered as a fallback.
     */
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

    /**
     * Wraps content page by page. Marked content ids are numbered per page, so the counter restarts
     * on every page rather than running across the document.
     */
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
            // A page with no markable operators has nothing to wrap, and rewriting it would cost a
            // parse, a re-serialise and a recompress to produce an identical stream.
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
        // Marking images decorative makes a document validate by hiding content from assistive
        // technology. That is sometimes right, but it must never look like a clean result.
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
     * A structure tree is only worth keeping when it is actually wired up: it needs children, a
     * parent tree to resolve marked content back to elements, and a catalog that admits the
     * document is marked. A tree failing any of those claims coverage it does not have, and keeping
     * it would leave the document permanently unfixable.
     */
    static boolean hasUsableStructureTree(PDDocument document) {
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
