package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSObject;
import org.apache.pdfbox.cos.COSObjectKey;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDComboBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Pins how a choice field's options survive a save, which real forms rely on. */
class ChoiceOptionRoundTripTest {

    private static PDComboBox combo(PDDocument document, List<String> options) throws IOException {
        document.addPage(new PDPage(PDRectangle.A4));
        PDAcroForm form = new PDAcroForm(document);
        document.getDocumentCatalog().setAcroForm(form);
        PDComboBox field = new PDComboBox(form);
        field.setPartialName("state");
        field.setOptions(options);
        form.getFields().add(field);
        return field;
    }

    @Test
    @DisplayName("a whitespace-only option survives a load, save and reload")
    void whitespaceOptionSurvivesRoundTrip() throws IOException {
        List<String> options = List.of(" ", "Alabama", "Alaska");

        byte[] first;
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            combo(document, options);
            document.save(out);
            first = out.toByteArray();
        }
        // The real path edits a document loaded from bytes, not one built in memory.
        byte[] saved;
        try (PDDocument loaded = Loader.loadPDF(first);
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            loaded.save(out);
            saved = out.toByteArray();
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDComboBox reread =
                    (PDComboBox) reloaded.getDocumentCatalog().getAcroForm(null).getField("state");
            assertEquals(
                    options,
                    reread.getOptionsExportValues(),
                    "an option must not vanish because the writer made it indirect");
        }
    }

    @Test
    @DisplayName("an option stored as an indirect reference is still reported")
    void indirectOptionIsStillReported() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDComboBox field = combo(document, List.of(" ", "Alabama"));

            // Real forms reference option strings indirectly; the reader must follow the reference.
            COSArray options = new COSArray();
            options.add(new COSObject(new COSString(" "), new COSObjectKey(629, 0)));
            options.add(new COSString("Alabama"));
            field.getCOSObject().setItem(COSName.OPT, options);

            // Every read path runs this repair first, which is where the reference is followed.
            FormUtils.repairMissingWidgetPageReferences(document);

            assertEquals(
                    List.of(" ", "Alabama"),
                    field.getOptionsExportValues(),
                    "an indirectly stored option must not be dropped");
        }
    }

    @Test
    @DisplayName("a signature field reports no value rather than a JVM identity hash")
    void signatureValueIsNotAnIdentityHash() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage(PDRectangle.A4));
            PDAcroForm form = new PDAcroForm(document);
            document.getDocumentCatalog().setAcroForm(form);
            PDSignatureField signature = new PDSignatureField(form);
            signature.setPartialName("approval");
            // Only a field that actually holds a signature hits getValueAsString's toString().
            signature.setValue(new PDSignature());
            form.getFields().add(signature);

            List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(document);

            FormUtils.FormFieldInfo field =
                    fields.stream()
                            .filter(f -> "approval".equals(f.name()))
                            .findFirst()
                            .orElseThrow();
            // An identity hash differs per load, so the same document would describe itself twice.
            assertNull(field.value(), "a signature has no text value");
        }
    }
}
