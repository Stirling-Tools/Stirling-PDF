package stirling.software.common.pdf.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Tests the document-level requirements that have nothing to do with tagging. */
class PdfUaMetadataWriterTest {

    private static PDDocument twoPageDocument() {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        document.addPage(new PDPage());
        return document;
    }

    private static String xmpOf(PDDocument document) throws IOException {
        var metadata = document.getDocumentCatalog().getMetadata();
        assertNotNull(metadata, "no XMP packet was written");
        return new String(metadata.toByteArray(), StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("sets title, language, tab order and the display-title flag")
    void appliesDocumentRequirements() throws Exception {
        try (PDDocument document = twoPageDocument()) {
            new PdfUaMetadataWriter()
                    .applyDocumentRequirements(
                            document, "Annual Report", "en-GB", PdfUaProfile.UA1);

            assertEquals("en-GB", document.getDocumentCatalog().getLanguage());
            assertEquals("Annual Report", document.getDocumentInformation().getTitle());
            assertTrue(
                    document.getDocumentCatalog().getViewerPreferences().displayDocTitle(),
                    "without DisplayDocTitle a viewer shows the filename instead of the title");

            for (PDPage page : document.getPages()) {
                assertEquals(
                        "S",
                        page.getCOSObject().getNameAsString(COSName.getPDFName("Tabs")),
                        "clause 7.18.1 requires an explicit tab order on every page");
            }
        }
    }

    @Test
    @DisplayName("writes dc:title into the XMP packet, not just the info dictionary")
    void writesDublinCoreTitle() throws Exception {
        try (PDDocument document = twoPageDocument()) {
            new PdfUaMetadataWriter()
                    .applyDocumentRequirements(
                            document, "Annual Report", "en-GB", PdfUaProfile.UA1);
            assertTrue(xmpOf(document).contains("Annual Report"));
        }
    }

    @Test
    @DisplayName("does not declare conformance as part of applying requirements")
    void doesNotDeclareEarly() throws Exception {
        try (PDDocument document = twoPageDocument()) {
            new PdfUaMetadataWriter()
                    .applyDocumentRequirements(document, "Report", "en", PdfUaProfile.UA1);
            assertFalse(
                    xmpOf(document).contains("pdfuaid"),
                    "the conformance claim must wait until validation has passed");
        }
    }

    @Test
    @DisplayName("declaring conformance writes pdfuaid with the right part")
    void declaresConformance() throws Exception {
        try (PDDocument document = twoPageDocument()) {
            PdfUaMetadataWriter writer = new PdfUaMetadataWriter();
            writer.applyDocumentRequirements(document, "Report", "en", PdfUaProfile.UA1);
            writer.declareConformance(document, PdfUaProfile.UA1);

            String xmp = xmpOf(document);
            assertTrue(xmp.contains("pdfuaid"), "no PDF/UA identifier was written");
            assertTrue(xmp.contains("part"), "no conformance part was written");
        }
    }

    @Test
    @DisplayName("UA-2 raises the PDF version to 2.0")
    void ua2RaisesVersion() throws Exception {
        try (PDDocument document = twoPageDocument()) {
            new PdfUaMetadataWriter()
                    .applyDocumentRequirements(document, "Report", "en", PdfUaProfile.UA2);
            assertEquals(2.0f, document.getVersion());
        }
    }

    @Test
    @DisplayName("keeps an existing title when none is supplied")
    void keepsExistingTitle() throws Exception {
        try (PDDocument document = twoPageDocument()) {
            var info = document.getDocumentInformation();
            info.setTitle("Original Title");
            document.setDocumentInformation(info);

            new PdfUaMetadataWriter()
                    .applyDocumentRequirements(document, null, "en", PdfUaProfile.UA1);
            assertEquals("Original Title", document.getDocumentInformation().getTitle());
        }
    }

    @Test
    @DisplayName("survives a round trip through save and reload")
    void survivesRoundTrip() throws Exception {
        byte[] saved;
        try (PDDocument document = twoPageDocument()) {
            PdfUaMetadataWriter writer = new PdfUaMetadataWriter();
            writer.applyDocumentRequirements(document, "Round Trip", "fr-FR", PdfUaProfile.UA1);
            writer.declareConformance(document, PdfUaProfile.UA1);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            saved = out.toByteArray();
        }
        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            assertEquals("fr-FR", reloaded.getDocumentCatalog().getLanguage());
            assertEquals("Round Trip", reloaded.getDocumentInformation().getTitle());
            assertTrue(xmpOf(reloaded).contains("pdfuaid"));
        }
    }
}
