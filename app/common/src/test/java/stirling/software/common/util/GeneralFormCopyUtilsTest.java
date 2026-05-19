package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;

class GeneralFormCopyUtilsTest {

    @Test
    void hasAnyRotatedPage_noRotation_returnsFalse() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            doc.addPage(new PDPage());
            assertFalse(GeneralFormCopyUtils.hasAnyRotatedPage(doc));
        }
    }

    @Test
    void hasAnyRotatedPage_with90Rotation_returnsTrue() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            page.setRotation(90);
            doc.addPage(page);
            assertTrue(GeneralFormCopyUtils.hasAnyRotatedPage(doc));
        }
    }

    @Test
    void hasAnyRotatedPage_with180Rotation_returnsTrue() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            page.setRotation(180);
            doc.addPage(page);
            assertTrue(GeneralFormCopyUtils.hasAnyRotatedPage(doc));
        }
    }

    @Test
    void hasAnyRotatedPage_with360Rotation_returnsFalse() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            page.setRotation(360);
            doc.addPage(page);
            assertFalse(GeneralFormCopyUtils.hasAnyRotatedPage(doc));
        }
    }

    @Test
    void hasAnyRotatedPage_emptyDocument_returnsFalse() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            assertFalse(GeneralFormCopyUtils.hasAnyRotatedPage(doc));
        }
    }

    @Test
    void hasAnyRotatedPage_mixedPages_returnsTrue() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            PDPage rotated = new PDPage();
            rotated.setRotation(270);
            doc.addPage(rotated);
            assertTrue(GeneralFormCopyUtils.hasAnyRotatedPage(doc));
        }
    }

    @Test
    void copyAndTransformFormFields_noAcroForm_doesNotThrow() throws Exception {
        try (PDDocument source = new PDDocument();
                PDDocument target = new PDDocument()) {
            source.addPage(new PDPage());
            target.addPage(new PDPage());
            // No acro form set on source - should simply return without error
            assertDoesNotThrow(
                    () ->
                            GeneralFormCopyUtils.copyAndTransformFormFields(
                                    source, target, 1, 1, 1, 1, 612f, 792f));
        }
    }

    @Test
    void copyAndTransformFormFields_emptyAcroForm_doesNotThrow() throws Exception {
        try (PDDocument source = new PDDocument();
                PDDocument target = new PDDocument()) {
            source.addPage(new PDPage());
            target.addPage(new PDPage());
            // Empty acro form
            var acroForm = new org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm(source);
            source.getDocumentCatalog().setAcroForm(acroForm);
            assertDoesNotThrow(
                    () ->
                            GeneralFormCopyUtils.copyAndTransformFormFields(
                                    source, target, 1, 1, 1, 1, 612f, 792f));
        }
    }
}
