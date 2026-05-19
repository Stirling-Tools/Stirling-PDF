package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDNonTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.Test;

class FormUtilsPruneOrphanedFieldsTest {

    @Test
    void noAcroFormIsNoOp() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage(PDRectangle.A4));
            FormUtils.pruneOrphanedFormFields(document);
            assertNull(document.getDocumentCatalog().getAcroForm(null));
        }
    }

    @Test
    void dropsFieldsWhoseWidgetsAreAllOnRemovedPages() throws IOException {
        byte[] pdfBytes = buildPdfWithFieldPerPage(3);

        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            document.removePage(2);
            document.removePage(0);

            FormUtils.pruneOrphanedFormFields(document);

            PDAcroForm form = document.getDocumentCatalog().getAcroForm(null);
            assertNotNull(form);
            List<String> remainingNames = new ArrayList<>();
            for (PDField field : form.getFields()) {
                remainingNames.add(field.getPartialName());
            }
            assertEquals(List.of("field_1"), remainingNames);
        }
    }

    @Test
    void dropsAcroFormEntirelyWhenNoFieldsSurvive() throws IOException {
        byte[] pdfBytes = buildPdfWithFieldPerPage(2);

        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            document.removePage(1);
            document.removePage(0);
            document.addPage(new PDPage(PDRectangle.A4));

            FormUtils.pruneOrphanedFormFields(document);

            assertNull(document.getDocumentCatalog().getAcroForm(null));
        }
    }

    @Test
    void keepsLiveWidgetsAndDropsOrphanWidgetsFromMultiWidgetField() throws IOException {
        byte[] pdfBytes = buildPdfWithMultiWidgetField();

        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            document.removePage(0);

            FormUtils.pruneOrphanedFormFields(document);

            PDAcroForm form = document.getDocumentCatalog().getAcroForm(null);
            assertNotNull(form);
            assertEquals(1, form.getFields().size());
            PDField field = form.getFields().get(0);
            assertEquals("multi", field.getPartialName());
            assertEquals(2, field.getWidgets().size(), "two widgets remain after one is dropped");
        }
    }

    @Test
    void survivesRoundTripWithoutOrphanPagesInOutput() throws IOException {
        byte[] pdfBytes = buildPdfWithFieldPerPage(3);

        byte[] writtenBytes;
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            document.removePage(2);
            document.removePage(1);
            FormUtils.pruneOrphanedFormFields(document);
            try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                document.save(out);
                writtenBytes = out.toByteArray();
            }
        }

        try (PDDocument reloaded = Loader.loadPDF(writtenBytes)) {
            assertEquals(1, reloaded.getNumberOfPages());
            PDAcroForm form = reloaded.getDocumentCatalog().getAcroForm(null);
            assertNotNull(form);
            assertEquals(1, form.getFields().size());
            assertEquals("field_0", form.getFields().get(0).getPartialName());
        }
    }

    @Test
    void prunesNestedNonTerminalFields() throws IOException {
        byte[] pdfBytes = buildPdfWithNestedFields();

        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            document.removePage(1);

            FormUtils.pruneOrphanedFormFields(document);

            PDAcroForm form = document.getDocumentCatalog().getAcroForm(null);
            assertNotNull(form);
            assertEquals(1, form.getFields().size());
            PDField group = form.getFields().get(0);
            assertEquals("group", group.getPartialName());
            assertTrue(group instanceof PDNonTerminalField);
            PDNonTerminalField nonTerminal = (PDNonTerminalField) group;
            assertEquals(1, nonTerminal.getChildren().size());
            assertEquals("kept", nonTerminal.getChildren().get(0).getPartialName());
        }
    }

    private static byte[] buildPdfWithFieldPerPage(int pageCount) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDAcroForm acroForm = new PDAcroForm(document);
            acroForm.setDefaultResources(new PDResources());
            document.getDocumentCatalog().setAcroForm(acroForm);

            for (int i = 0; i < pageCount; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);

                PDTextField field = new PDTextField(acroForm);
                field.setPartialName("field_" + i);
                PDAnnotationWidget widget = new PDAnnotationWidget();
                widget.setRectangle(new PDRectangle(50, 50, 100, 20));
                widget.setPage(page);
                field.setWidgets(List.of(widget));
                acroForm.getFields().add(field);
                page.getAnnotations().add(widget);
            }

            try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                document.save(out);
                return out.toByteArray();
            }
        }
    }

    private static byte[] buildPdfWithMultiWidgetField() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDAcroForm acroForm = new PDAcroForm(document);
            acroForm.setDefaultResources(new PDResources());
            document.getDocumentCatalog().setAcroForm(acroForm);

            List<PDAnnotationWidget> widgets = new ArrayList<>();
            for (int i = 0; i < 3; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);
                PDAnnotationWidget widget = new PDAnnotationWidget();
                widget.setRectangle(new PDRectangle(50, 50, 100, 20));
                widget.setPage(page);
                page.getAnnotations().add(widget);
                widgets.add(widget);
            }

            PDTextField field = new PDTextField(acroForm);
            field.setPartialName("multi");
            field.setWidgets(widgets);
            acroForm.getFields().add(field);

            try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                document.save(out);
                return out.toByteArray();
            }
        }
    }

    private static byte[] buildPdfWithNestedFields() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDAcroForm acroForm = new PDAcroForm(document);
            acroForm.setDefaultResources(new PDResources());
            document.getDocumentCatalog().setAcroForm(acroForm);

            PDPage pageA = new PDPage(PDRectangle.A4);
            PDPage pageB = new PDPage(PDRectangle.A4);
            document.addPage(pageA);
            document.addPage(pageB);

            PDNonTerminalField group = new PDNonTerminalField(acroForm);
            group.setPartialName("group");

            PDTextField kept = new PDTextField(acroForm);
            kept.setPartialName("kept");
            PDAnnotationWidget keptWidget = new PDAnnotationWidget();
            keptWidget.setRectangle(new PDRectangle(50, 50, 100, 20));
            keptWidget.setPage(pageA);
            kept.setWidgets(List.of(keptWidget));
            pageA.getAnnotations().add(keptWidget);

            PDTextField dropped = new PDTextField(acroForm);
            dropped.setPartialName("dropped");
            PDAnnotationWidget droppedWidget = new PDAnnotationWidget();
            droppedWidget.setRectangle(new PDRectangle(50, 100, 100, 20));
            droppedWidget.setPage(pageB);
            dropped.setWidgets(List.of(droppedWidget));
            pageB.getAnnotations().add(droppedWidget);

            group.setChildren(List.of(kept, dropped));
            acroForm.getFields().add(group);

            try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                document.save(out);
                return out.toByteArray();
            }
        }
    }
}
