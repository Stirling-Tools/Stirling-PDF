package stirling.software.proprietary.pdf.ua;

import java.util.Set;

import org.apache.pdfbox.pdmodel.PDDocument;

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

    /** Facts for a document nothing has rewritten, used when font embedding did not run. */
    public static final SourceFacts NONE = new SourceFacts(null, Set.of(), false);

    public static SourceFacts of(PDDocument document) {
        String language = null;
        boolean usable = false;
        try {
            language = document.getDocumentCatalog().getLanguage();
            usable = PdfUaTagger.hasUsableStructureTree(document);
        } catch (RuntimeException e) {
            log.debug("Could not read source facts: {}", e.getMessage());
        }
        return new SourceFacts(language, Set.copyOf(PdfUaTagger.structureTypes(document)), usable);
    }
}
