package stirling.software.common.pdf.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * A relabelled language is invisible to every validator, so the tagger must not guess over one the
 * document already declares.
 */
class PdfUaLanguageTest {

    private static PDDocument documentWithLanguage(String language) {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        if (language != null) {
            document.getDocumentCatalog().setLanguage(language);
        }
        return document;
    }

    private static TaggingOptions.TaggingOptionsBuilder options() {
        return TaggingOptions.builder()
                .profile(PdfUaProfile.UA1)
                .language("en-GB")
                .title("Rapport")
                .embedFonts(false);
    }

    @Test
    @DisplayName("keeps the language the document already declares")
    void keepsExistingLanguage() throws Exception {
        try (PDDocument document = documentWithLanguage("fr-FR")) {
            TaggingResult result = new PdfUaTagger().tag(document, options().build());

            assertEquals("fr-FR", document.getDocumentCatalog().getLanguage());
            assertTrue(
                    result.getWarnings().stream().anyMatch(w -> w.contains("fr-FR")),
                    "ignoring the requested language must be reported: " + result.getWarnings());
        }
    }

    @Test
    @DisplayName("applies the requested language when the document declares none")
    void fillsInMissingLanguage() throws Exception {
        try (PDDocument document = documentWithLanguage(null)) {
            new PdfUaTagger().tag(document, options().build());

            assertEquals("en-GB", document.getDocumentCatalog().getLanguage());
        }
    }

    @Test
    @DisplayName("replaces the declared language only when the caller asks")
    void overridesOnRequest() throws Exception {
        try (PDDocument document = documentWithLanguage("fr-FR")) {
            new PdfUaTagger().tag(document, options().overrideLanguage(true).build());

            assertEquals("en-GB", document.getDocumentCatalog().getLanguage());
        }
    }

    @Test
    @DisplayName("keeps the existing language when an existing structure tree is left alone")
    void keepsExistingLanguageWithoutRebuilding() throws Exception {
        try (PDDocument document = documentWithLanguage("de-DE")) {
            new PdfUaTagger()
                    .tag(
                            document,
                            options().existingTags(TaggingOptions.ExistingTags.KEEP).build());

            assertEquals("de-DE", document.getDocumentCatalog().getLanguage());
        }
    }
}
