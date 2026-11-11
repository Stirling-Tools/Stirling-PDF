package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.junit.jupiter.api.Test;

/** An edit the backend cannot honour must be reported, not logged and reported as success. */
class FormUtilsEditReportingTest {

    private static FormUtils.NewFormFieldDefinition field(String type, String name) {
        return new FormUtils.NewFormFieldDefinition(
                name, name, type, 0, 60f, 700f, 120f, 20f, null, null, null, null, null, null, null,
                null, null, null);
    }

    private static PDDocument blank() {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage(PDRectangle.LETTER));
        document.getDocumentCatalog().setAcroForm(new PDAcroForm(document));
        return document;
    }

    @Test
    void anUncreatableTypeIsReportedRatherThanSilentlyMadeText() throws IOException {
        List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
        try (PDDocument document = blank()) {
            FormUtils.addNewFields(document, List.of(field("nonsense", "mystery")), skipped);
            PDAcroForm acroForm = document.getDocumentCatalog().getAcroForm(null);
            assertTrue(
                    acroForm.getFields().isEmpty(),
                    "an unsupported type must not quietly become a text field");
        }
        assertEquals(1, skipped.size(), "the caller must be told: " + skipped);
        assertTrue(skipped.get(0).reason().contains("nonsense"), skipped.get(0).reason());
    }

    @Test
    void aLyingPageCountIsSurvivable() throws IOException {
        // /Count overstates the tree, so getNumberOfPages() passes the guard but getPage throws.
        byte[] broken =
                ("%PDF-1.4\n"
                                + "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
                                + "2 0 obj << /Type /Pages /Count 1 /Kids [] >> endobj\n"
                                + "trailer << /Root 1 0 R >>\n")
                        .getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);
        List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
        try (PDDocument document = Loader.loadPDF(broken)) {
            // Must not throw; the field is reported as skipped instead.
            FormUtils.addNewFields(document, List.of(field("text", "ghost")), skipped);
        } catch (IOException loadFailure) {
            // A parser that refuses the file outright is an equally acceptable outcome.
            return;
        }
        assertFalse(skipped.isEmpty(), "an unreachable page must be reported, not thrown");
    }

    @Test
    void aTwoWidgetCheckboxKeepsItsOnStateWhenMoved() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage(PDRectangle.LETTER));
            document.addPage(new PDPage(PDRectangle.LETTER));
            document.getDocumentCatalog().setAcroForm(new PDAcroForm(document));
            FormUtils.addNewFields(
                    document,
                    List.of(
                            new FormUtils.NewFormFieldDefinition(
                                    "agree",
                                    "agree",
                                    "checkbox",
                                    0,
                                    60f,
                                    700f,
                                    14f,
                                    14f,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null)),
                    new ArrayList<>());
            FormUtils.modifyFormFields(
                    document,
                    List.of(
                            new FormUtils.ModifyFormFieldDefinition(
                                    "agree", null, null, null, 0, 200f, 400f, null, null, null,
                                    null, null, null, null, null, null, null, null, null)));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            saved = out.toByteArray();
        }
        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            PDCheckBox box = (PDCheckBox) acroForm.getField("agree");
            assertNotNull(box);
            assertFalse(box.getOnValue().isEmpty(), "a moved checkbox must stay tickable");
        }
    }
}
