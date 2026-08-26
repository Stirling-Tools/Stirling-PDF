package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.Test;

/**
 * Most real PDFs have no AcroForm at all, so adding the very first field has to build one that
 * PDFBox will accept.
 */
class FormUtilsNoAcroFormTest {

    private static final Path PLAIN_PDF =
            Path.of("src/test/resources/pdf-ingestion-fixtures/many-tables-test_stress.pdf");

    private static FormUtils.NewFormFieldDefinition newField(
            String type, String name, float y, List<String> options, String defaultValue) {
        // name, label, type, pageIndex, x, y, width, height, required, multiSelect,
        // options, defaultValue, tooltip, fontSize, readOnly, multiline, maxLength, buttonAction
        return new FormUtils.NewFormFieldDefinition(
                name,
                name,
                type,
                0,
                60f,
                y,
                200f,
                20f,
                null,
                null,
                options,
                defaultValue,
                null,
                null,
                null,
                null,
                null,
                null);
    }

    private static PDDocument loadPlain() throws IOException {
        return Loader.loadPDF(Files.readAllBytes(PLAIN_PDF));
    }

    @Test
    void plainPdfReallyHasNoAcroForm() throws IOException {
        try (PDDocument document = loadPlain()) {
            assertNull(
                    document.getDocumentCatalog().getAcroForm(null),
                    "fixture must have no AcroForm or this test proves nothing");
        }
    }

    @Test
    void addsFirstFieldToAPdfWithNoAcroForm() throws IOException {
        byte[] saved;
        List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
        try (PDDocument document = loadPlain()) {
            FormUtils.addNewFields(
                    document,
                    List.of(
                            newField("text", "fullName", 700f, null, "Ada"),
                            newField("checkbox", "agree", 660f, null, null),
                            newField("radio", "contact", 600f, List.of("Email", "Post"), null)),
                    skipped);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            saved = out.toByteArray();
        }

        assertTrue(skipped.isEmpty(), "no field should be skipped: " + skipped);

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            assertNotNull(acroForm, "an AcroForm should have been created");
            assertNotNull(acroForm.getDefaultResources(), "/DR is required for variable text");
            assertTrue(
                    acroForm.getDefaultAppearance() != null
                            && !acroForm.getDefaultAppearance().isBlank(),
                    "/DA is required for variable text");
            PDTextField text = (PDTextField) acroForm.getField("fullName");
            assertNotNull(text, "the text field should exist");
            assertEquals("Ada", text.getValueAsString());
            assertNotNull(acroForm.getField("agree"));
            assertNotNull(acroForm.getField("contact"));
        }
    }
}
