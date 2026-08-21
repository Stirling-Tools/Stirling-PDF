package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDComboBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDPushButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Branch coverage for {@link GeneralFormCopyUtils#copyAndTransformFormFields} and the {@link
 * GeneralFormFieldTypeSupport} handlers, complementing GeneralFormCopyUtilsTest which only covers
 * rotation and the empty-form early returns.
 */
class GeneralFormCopyUtilsMoreTest {

    private static PDAcroForm newAcroForm(PDDocument document) {
        PDAcroForm acroForm = new PDAcroForm(document);
        PDResources dr = new PDResources();
        dr.put(COSName.getPDFName("Helv"), new PDType1Font(Standard14Fonts.FontName.HELVETICA));
        acroForm.setDefaultResources(dr);
        acroForm.setDefaultAppearance("/Helv 12 Tf 0 g");
        document.getDocumentCatalog().setAcroForm(acroForm);
        return acroForm;
    }

    private static void addWidget(PDTerminalField field, PDPage page, PDRectangle rect)
            throws IOException {
        PDAnnotationWidget widget = new PDAnnotationWidget();
        widget.setRectangle(rect);
        widget.setPage(page);
        List<PDAnnotationWidget> widgets = new ArrayList<>();
        widgets.add(widget);
        field.setWidgets(widgets);
        page.getAnnotations().add(widget);
    }

    // ----------------------------------------------------------------------
    // copyAndTransformFormFields - real field copying
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("copyAndTransformFormFields copying")
    class CopyingFields {

        @Test
        void copiesTextCheckboxAndComboFields() throws IOException {
            try (PDDocument source = new PDDocument();
                    PDDocument target = new PDDocument()) {
                PDPage sourcePage = new PDPage(PDRectangle.A4);
                source.addPage(sourcePage);
                target.addPage(new PDPage(PDRectangle.A4));

                PDAcroForm sourceForm = newAcroForm(source);

                PDTextField text = new PDTextField(sourceForm);
                text.setPartialName("name");
                addWidget(text, sourcePage, new PDRectangle(50, 700, 200, 20));
                sourceForm.getFields().add(text);
                text.setValue("Alice");

                PDCheckBox check = new PDCheckBox(sourceForm);
                check.setPartialName("agree");
                check.setExportValues(List.of("Yes"));
                addWidget(check, sourcePage, new PDRectangle(50, 660, 16, 16));
                sourceForm.getFields().add(check);

                PDComboBox combo = new PDComboBox(sourceForm);
                combo.setPartialName("color");
                addWidget(combo, sourcePage, new PDRectangle(50, 620, 200, 20));
                sourceForm.getFields().add(combo);
                combo.setOptions(List.of("Red", "Green"));

                GeneralFormCopyUtils.copyAndTransformFormFields(
                        source, target, 1, 1, 1, 1, 612f, 792f);

                PDAcroForm targetForm = target.getDocumentCatalog().getAcroForm();
                assertNotNull(targetForm);
                assertEquals(3, targetForm.getFields().size());
                List<String> names = new ArrayList<>();
                for (var f : targetForm.getFields()) {
                    names.add(f.getPartialName());
                }
                // Names are prefixed with page index during copy.
                assertThat(names).contains("page0_name", "page0_agree", "page0_color");
            }
        }

        @Test
        void copiesFieldThroughMultiCellGridLayout() throws IOException {
            try (PDDocument source = new PDDocument();
                    PDDocument target = new PDDocument()) {
                PDPage sourcePage = new PDPage(PDRectangle.A4);
                source.addPage(sourcePage);
                target.addPage(new PDPage(PDRectangle.A4));

                PDAcroForm sourceForm = newAcroForm(source);
                PDTextField text = new PDTextField(sourceForm);
                text.setPartialName("name");
                addWidget(text, sourcePage, new PDRectangle(100, 100, 200, 20));
                sourceForm.getFields().add(text);

                // 2x2 layout exercises the scale/offset arithmetic for cell placement.
                GeneralFormCopyUtils.copyAndTransformFormFields(
                        source, target, 1, 4, 2, 2, 300f, 396f);

                PDAcroForm targetForm = target.getDocumentCatalog().getAcroForm();
                assertEquals(1, targetForm.getFields().size());
                assertEquals("page0_name", targetForm.getFields().get(0).getPartialName());
                assertEquals(1, targetForm.getFields().get(0).getWidgets().size());
            }
        }

        @Test
        void skipsPagesWithoutAnnotations() throws IOException {
            try (PDDocument source = new PDDocument();
                    PDDocument target = new PDDocument()) {
                source.addPage(new PDPage(PDRectangle.A4)); // no annotations
                target.addPage(new PDPage(PDRectangle.A4));

                // Source has an AcroForm with a field on a different (non-existent here) page,
                // but page 0 has no annotations -> the per-page copy is skipped.
                PDAcroForm sourceForm = newAcroForm(source);
                PDTextField text = new PDTextField(sourceForm);
                text.setPartialName("ghost");
                sourceForm.getFields().add(text);

                GeneralFormCopyUtils.copyAndTransformFormFields(
                        source, target, 1, 1, 1, 1, 612f, 792f);

                PDAcroForm targetForm = target.getDocumentCatalog().getAcroForm();
                // Form is created but no widgets were copied.
                assertNotNull(targetForm);
                assertTrue(targetForm.getFields().isEmpty());
            }
        }

        @Test
        void skipsWhenRowIndexExceedsRows() throws IOException {
            try (PDDocument source = new PDDocument();
                    PDDocument target = new PDDocument()) {
                PDPage page0 = new PDPage(PDRectangle.A4);
                PDPage page1 = new PDPage(PDRectangle.A4);
                source.addPage(page0);
                source.addPage(page1);
                target.addPage(new PDPage(PDRectangle.A4));

                PDAcroForm sourceForm = newAcroForm(source);
                PDTextField a = new PDTextField(sourceForm);
                a.setPartialName("a");
                addWidget(a, page0, new PDRectangle(10, 10, 100, 20));
                sourceForm.getFields().add(a);

                PDTextField b = new PDTextField(sourceForm);
                b.setPartialName("b");
                addWidget(b, page1, new PDRectangle(10, 10, 100, 20));
                sourceForm.getFields().add(b);

                // cols=1, rows=1, pagesPerSheet=2 -> second page maps to rowIndex 1 (>= rows) ->
                // skipped.
                GeneralFormCopyUtils.copyAndTransformFormFields(
                        source, target, 2, 2, 1, 1, 612f, 792f);

                PDAcroForm targetForm = target.getDocumentCatalog().getAcroForm();
                assertEquals(1, targetForm.getFields().size());
                assertEquals("page0_a", targetForm.getFields().get(0).getPartialName());
            }
        }

        @Test
        void skipsWhenDestinationPageMissing() throws IOException {
            try (PDDocument source = new PDDocument();
                    PDDocument target = new PDDocument()) {
                PDPage sourcePage = new PDPage(PDRectangle.A4);
                source.addPage(sourcePage);
                // Target has NO pages, so destinationPageIndex 0 is out of bounds.

                PDAcroForm sourceForm = newAcroForm(source);
                PDTextField text = new PDTextField(sourceForm);
                text.setPartialName("name");
                addWidget(text, sourcePage, new PDRectangle(50, 700, 200, 20));
                sourceForm.getFields().add(text);

                assertDoesNotThrow(
                        () ->
                                GeneralFormCopyUtils.copyAndTransformFormFields(
                                        source, target, 1, 1, 1, 1, 612f, 792f));

                PDAcroForm targetForm = target.getDocumentCatalog().getAcroForm();
                assertTrue(targetForm.getFields().isEmpty());
            }
        }

        @Test
        void uniquifiesDuplicateFieldNamesAcrossPages() throws IOException {
            try (PDDocument source = new PDDocument();
                    PDDocument target = new PDDocument()) {
                PDPage sourcePage = new PDPage(PDRectangle.A4);
                source.addPage(sourcePage);
                target.addPage(new PDPage(PDRectangle.A4));

                PDAcroForm sourceForm = newAcroForm(source);

                // Two separate fields placed on the same source page with the same partial name
                // would clash; the copier must generate distinct names.
                PDTextField one = new PDTextField(sourceForm);
                one.setPartialName("dup");
                addWidget(one, sourcePage, new PDRectangle(50, 700, 100, 20));
                sourceForm.getFields().add(one);

                PDTextField two = new PDTextField(sourceForm);
                two.setPartialName("dup");
                addWidget(two, sourcePage, new PDRectangle(50, 660, 100, 20));
                sourceForm.getFields().add(two);

                GeneralFormCopyUtils.copyAndTransformFormFields(
                        source, target, 1, 1, 1, 1, 612f, 792f);

                PDAcroForm targetForm = target.getDocumentCatalog().getAcroForm();
                assertEquals(2, targetForm.getFields().size());
                List<String> names = new ArrayList<>();
                for (var f : targetForm.getFields()) {
                    names.add(f.getPartialName());
                }
                // First keeps page0_dup; the second is suffixed.
                assertTrue(names.contains("page0_dup"));
                assertTrue(names.stream().anyMatch(n -> n.startsWith("page0_dup_")));
            }
        }
    }

    // ----------------------------------------------------------------------
    // GeneralFormFieldTypeSupport - forField / createField / copyFromOriginal
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("GeneralFormFieldTypeSupport")
    class TypeSupport {

        @Test
        void forFieldNullReturnsNull() {
            assertNull(GeneralFormFieldTypeSupport.forField(null));
        }

        @Test
        void forFieldResolvesEachConcreteType() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDAcroForm form = newAcroForm(doc);
                assertEquals(
                        GeneralFormFieldTypeSupport.TEXT,
                        GeneralFormFieldTypeSupport.forField(new PDTextField(form)));
                assertEquals(
                        GeneralFormFieldTypeSupport.CHECKBOX,
                        GeneralFormFieldTypeSupport.forField(new PDCheckBox(form)));
                assertEquals(
                        GeneralFormFieldTypeSupport.COMBOBOX,
                        GeneralFormFieldTypeSupport.forField(new PDComboBox(form)));
                assertEquals(
                        GeneralFormFieldTypeSupport.BUTTON,
                        GeneralFormFieldTypeSupport.forField(new PDPushButton(form)));
            }
        }

        @Test
        void createFieldProducesMatchingInstance() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDAcroForm form = newAcroForm(doc);
                PDTerminalField text = GeneralFormFieldTypeSupport.TEXT.createField(form);
                assertTrue(text instanceof PDTextField);
                PDTerminalField check = GeneralFormFieldTypeSupport.CHECKBOX.createField(form);
                assertTrue(check instanceof PDCheckBox);
            }
        }

        @Test
        void copyFromOriginalTransfersComboOptions() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDAcroForm form = newAcroForm(doc);
                PDComboBox src = new PDComboBox(form);
                src.setPartialName("src");
                src.setOptions(List.of("A", "B"));
                PDComboBox dst = new PDComboBox(form);
                dst.setPartialName("dst");

                GeneralFormFieldTypeSupport.COMBOBOX.copyFromOriginal(src, dst);
                assertThat(dst.getOptions()).contains("A", "B");
            }
        }

        @Test
        void copyFromOriginalTransfersTextValue() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDAcroForm form = newAcroForm(doc);
                PDTextField src = new PDTextField(form);
                src.setPartialName("src");
                src.setValue("hello");
                PDTextField dst = new PDTextField(form);
                dst.setPartialName("dst");
                dst.setDefaultAppearance("/Helv 12 Tf 0 g");

                GeneralFormFieldTypeSupport.TEXT.copyFromOriginal(src, dst);
                assertEquals("hello", dst.getValueAsString());
            }
        }

        @Test
        void typeNameAndFallbackWidgetNameExposed() {
            assertEquals("text", GeneralFormFieldTypeSupport.TEXT.typeName());
            assertEquals("textField", GeneralFormFieldTypeSupport.TEXT.fallbackWidgetName());
            assertEquals("checkbox", GeneralFormFieldTypeSupport.CHECKBOX.typeName());
        }
    }
}
