package stirling.software.proprietary.pdf.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureElement;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureNode;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Covers form-field descriptions, widget nesting and withdrawing a conformance claim. */
class PdfUaFormAndDeclarationTest {

    /** A document with one named text field and one unnamed one. */
    private static PDDocument formDocument(boolean nameTheSecondField) throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        document.addPage(page);

        PDAcroForm form = new PDAcroForm(document);
        document.getDocumentCatalog().setAcroForm(form);

        PDTextField named = new PDTextField(form);
        named.setPartialName("EmailAddress");
        addWidget(named, page, 700);
        form.getFields().add(named);

        PDTextField second = new PDTextField(form);
        if (nameTheSecondField) {
            second.setPartialName("PostCode");
        }
        addWidget(second, page, 650);
        form.getFields().add(second);

        return document;
    }

    private static void addWidget(PDTextField field, PDPage page, float y) throws IOException {
        PDAnnotationWidget widget = field.getWidgets().get(0);
        PDRectangle rectangle = new PDRectangle();
        rectangle.setLowerLeftX(50);
        rectangle.setLowerLeftY(y);
        rectangle.setUpperRightX(250);
        rectangle.setUpperRightY(y + 18);
        widget.setRectangle(rectangle);
        widget.setPage(page);
        page.getAnnotations().add(widget);
    }

    private static String xmpOf(PDDocument document) throws IOException {
        var metadata = document.getDocumentCatalog().getMetadata();
        assertNotNull(metadata, "no XMP packet");
        return new String(metadata.toByteArray(), StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("a form field gets its tooltip from its own name, not an invented one")
    void derivesTooltipFromFieldName() throws Exception {
        try (PDDocument document = formDocument(true)) {
            List<String> warnings =
                    new PdfUaMetadataWriter()
                            .applyDocumentRequirements(document, "Form", "en", PdfUaProfile.UA1);

            PDAcroForm form = document.getDocumentCatalog().getAcroForm();
            assertEquals("EmailAddress", form.getField("EmailAddress").getAlternateFieldName());
            assertEquals("PostCode", form.getField("PostCode").getAlternateFieldName());
            assertTrue(warnings.isEmpty(), "nothing needed reporting: " + warnings);
        }
    }

    @Test
    @DisplayName("a field with no name is reported rather than given a placeholder tooltip")
    void reportsUnnameableField() throws Exception {
        try (PDDocument document = formDocument(false)) {
            List<String> warnings =
                    new PdfUaMetadataWriter()
                            .applyDocumentRequirements(document, "Form", "en", PdfUaProfile.UA1);
            assertEquals(1, warnings.size());
            assertTrue(warnings.get(0).contains("form field"), warnings.get(0));
        }
    }

    @Test
    @DisplayName("an existing description is never overwritten")
    void keepsExistingDescription() throws Exception {
        try (PDDocument document = formDocument(true)) {
            PDAcroForm form = document.getDocumentCatalog().getAcroForm();
            form.getField("EmailAddress").setAlternateFieldName("Your email address");

            new PdfUaMetadataWriter()
                    .applyDocumentRequirements(document, "Form", "en", PdfUaProfile.UA1);
            assertEquals(
                    "Your email address", form.getField("EmailAddress").getAlternateFieldName());
        }
    }

    @Test
    @DisplayName("widget annotations are nested inside a Form structure element")
    void widgetsAreNestedInFormElements() throws Exception {
        try (PDDocument document = formDocument(true)) {
            DocumentStructure structure = new DocumentStructure();
            StructBlock paragraph = new StructBlock(StructType.P, 0);
            paragraph.getMcids().add(0);
            structure.add(paragraph);

            new StructTreeWriter().write(document, structure, PdfUaProfile.UA1);

            var root = document.getDocumentCatalog().getStructureTreeRoot();
            assertTrue(
                    typesUnder(root).contains("Form"),
                    "clause 7.18.4 requires a widget to sit inside a Form element, found: "
                            + typesUnder(root));
        }
    }

    private static List<String> typesUnder(PDStructureNode node) {
        List<String> types = new java.util.ArrayList<>();
        for (Object kid : node.getKids()) {
            if (kid instanceof PDStructureElement element) {
                types.add(element.getStructureType());
                types.addAll(typesUnder(element));
            }
        }
        return types;
    }

    @Test
    @DisplayName("withdrawing conformance removes the claim but keeps the other metadata")
    void withdrawingConformanceRemovesOnlyTheClaim() throws Exception {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            PdfUaTagger tagger = new PdfUaTagger();
            PdfUaMetadataWriter writer = new PdfUaMetadataWriter();

            writer.applyDocumentRequirements(document, "Kept Title", "en-GB", PdfUaProfile.UA1);
            writer.declareConformance(document, PdfUaProfile.UA1);
            assertTrue(xmpOf(document).contains("pdfuaid"));

            tagger.withdrawConformance(document);

            String xmp = xmpOf(document);
            assertFalse(xmp.contains("pdfuaid"), "the conformance claim should be gone");
            assertTrue(xmp.contains("Kept Title"), "the title should survive");
            assertEquals("en-GB", document.getDocumentCatalog().getLanguage());
        }
    }

    @Test
    @DisplayName("withdrawing conformance on a document that never claimed it is harmless")
    void withdrawingIsIdempotent() throws Exception {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            new PdfUaMetadataWriter()
                    .applyDocumentRequirements(document, "Title", "en", PdfUaProfile.UA1);
            new PdfUaTagger().withdrawConformance(document);
            assertFalse(xmpOf(document).contains("pdfuaid"));
        }
    }
}
