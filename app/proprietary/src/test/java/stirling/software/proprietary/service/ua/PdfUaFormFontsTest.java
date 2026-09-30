package stirling.software.proprietary.service.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.Test;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.proprietary.model.api.ua.PdfUaConversionOutcome;
import stirling.software.proprietary.pdf.ua.PdfUaProfile;
import stirling.software.proprietary.pdf.ua.TaggingOptions;

class PdfUaFormFontsTest {

    /** Stands in for Ghostscript, which drops the form and draws its values into the page. */
    private static final class FlatteningEmbedder extends FontEmbeddingService {
        @Override
        public Result embedFonts(byte[] pdfBytes) {
            try (PDDocument document = Loader.loadPDF(pdfBytes)) {
                PDAcroForm form = document.getDocumentCatalog().getAcroForm();
                form.flatten();
                document.getDocumentCatalog().setAcroForm(null);
                return new Result(bytes(document), true, Set.of("Helvetica"), null);
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }
    }

    @Test
    void fontEmbeddingThatWouldFlattenAFormKeepsTheFields() throws Exception {
        PdfUaValidationService validation = new PdfUaValidationService();
        validation.initialise();
        PdfUaConversionService service =
                new PdfUaConversionService(
                        validation,
                        new FlatteningEmbedder(),
                        new CustomPDFDocumentFactory(
                                org.mockito.Mockito.mock(PdfMetadataService.class)));

        PdfUaConversionOutcome outcome =
                service.convert(
                        form(),
                        TaggingOptions.builder()
                                .profile(PdfUaProfile.UA1)
                                .language("en-GB")
                                .title("Form")
                                .embedFonts(true)
                                .build());

        try (PDDocument result = Loader.loadPDF(outcome.pdfBytes())) {
            PDAcroForm form = result.getDocumentCatalog().getAcroForm();
            assertEquals("value 1", form.getField("name").getValueAsString());
        }
        assertTrue(
                outcome.warnings().stream().anyMatch(w -> w.contains("form fields")),
                String.join(" | ", outcome.warnings()));
    }

    private static byte[] form() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDAcroForm form = new PDAcroForm(document);
            document.getDocumentCatalog().setAcroForm(form);
            PDResources resources = new PDResources();
            resources.put(
                    org.apache.pdfbox.cos.COSName.HELV,
                    new PDType1Font(Standard14Fonts.FontName.HELVETICA));
            form.setDefaultResources(resources);
            form.setDefaultAppearance("/Helv 12 Tf 0 g");
            PDTextField field = new PDTextField(form);
            field.setPartialName("name");
            form.getFields().add(field);
            PDAnnotationWidget widget = field.getWidgets().get(0);
            widget.setRectangle(new PDRectangle(72, 700, 200, 20));
            widget.setPage(page);
            page.getAnnotations().add(widget);
            field.setValue("value 1");
            return bytes(document);
        }
    }

    private static byte[] bytes(PDDocument document) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        document.save(out);
        return out.toByteArray();
    }
}
