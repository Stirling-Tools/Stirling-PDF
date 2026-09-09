package stirling.software.proprietary.pdf.ua;

import java.util.HashSet;
import java.util.Set;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureElement;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;

import lombok.extern.slf4j.Slf4j;

/**
 * What the document said about itself before anything rewrote it. Font embedding shells out to
 * Ghostscript, which returns a file with no structure tree, no {@code /Lang} and no XMP, so a
 * tagger reading the rewritten document sees an untagged, language-less file and cannot tell that
 * anything was lost. These facts are captured from the original and carried past that stage.
 *
 * @param language the catalog {@code /Lang} the author declared, or null
 * @param structureTypes every structure element type the original tree contained
 * @param hasUsableTree whether the original had a structure tree worth preserving
 */
@Slf4j
public record SourceFacts(String language, Set<String> structureTypes, boolean hasUsableTree) {

    private static final int MAX_DEPTH = 64;

    /** Facts for a document nothing has rewritten, used when font embedding did not run. */
    public static final SourceFacts NONE = new SourceFacts(null, Set.of(), false);

    public static SourceFacts of(PDDocument document) {
        String language = null;
        Set<String> types = new HashSet<>();
        boolean usable = false;
        try {
            language = document.getDocumentCatalog().getLanguage();
            usable = PdfUaTagger.hasUsableStructureTree(document);
            PDStructureTreeRoot root = document.getDocumentCatalog().getStructureTreeRoot();
            if (root != null) {
                collect(root.getKids(), types, 0);
            }
        } catch (RuntimeException e) {
            log.debug("Could not read source facts: {}", e.getMessage());
        }
        return new SourceFacts(language, Set.copyOf(types), usable);
    }

    private static void collect(Object node, Set<String> types, int depth) {
        // Damaged files can present a cyclic tree; cap rather than overflow the stack.
        if (node == null || depth > MAX_DEPTH) {
            return;
        }
        if (node instanceof java.util.List<?> list) {
            list.forEach(child -> collect(child, types, depth + 1));
        } else if (node instanceof PDStructureElement element) {
            types.add(element.getStructureType());
            collect(element.getKids(), types, depth + 1);
        }
    }
}
