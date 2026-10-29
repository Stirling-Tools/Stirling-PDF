package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.awt.image.BufferedImage;
import java.time.Duration;
import java.util.List;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDNonTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.Test;

/** Walkers over PDF object graphs must visit a shared or cyclic object once. */
class SharedReferenceWalkTest {

    private static final Duration LIMIT = Duration.ofSeconds(10);

    private static PDFormXObject form(PDDocument document) {
        PDFormXObject form = new PDFormXObject(document);
        form.setResources(new PDResources());
        return form;
    }

    @Test
    void imagesUnderAFormNamedManyTimesAreFoundOnce() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDImageXObject image =
                    LosslessFactory.createFromImage(
                            document, new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB));
            PDFormXObject inner = form(document);
            inner.getResources().put(COSName.getPDFName("Im"), image);
            PDFormXObject outer = form(document);
            for (int i = 0; i < 4; i++) {
                outer.getResources().put(COSName.getPDFName("F" + i), inner);
            }
            PDPage page = new PDPage();
            page.setResources(new PDResources());
            for (int i = 0; i < 4; i++) {
                page.getResources().put(COSName.getPDFName("F" + i), outer);
            }
            document.addPage(page);

            assertThat(PdfUtils.getAllImages(page.getResources())).hasSize(1);
            assertThat(PdfUtils.hasImagesOnPage(page)).isTrue();
        }
    }

    @Test
    void aFormThatNamesItselfIsSearchedOnce() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDFormXObject self = form(document);
            self.getResources().put(COSName.getPDFName("Self"), self);
            PDPage page = new PDPage();
            page.setResources(new PDResources());
            page.getResources().put(COSName.getPDFName("F"), self);
            document.addPage(page);

            assertTimeoutPreemptively(
                    LIMIT,
                    () -> {
                        assertThat(PdfUtils.getAllImages(page.getResources())).isEmpty();
                        assertThat(PdfUtils.hasImagesOnPage(page)).isFalse();
                    });
        }
    }

    @Test
    void aFormWithoutResourcesIsSkipped() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDFormXObject bare = new PDFormXObject(document);
            PDPage page = new PDPage();
            page.setResources(new PDResources());
            page.getResources().put(COSName.getPDFName("F"), bare);
            document.addPage(page);

            assertThat(PdfUtils.getAllImages(page.getResources())).isEmpty();
            assertThat(PdfUtils.hasImagesOnPage(page)).isFalse();
        }
    }

    @Test
    void pruningDropsRepeatedAndCyclicFieldKids() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            PDAcroForm acroForm = new PDAcroForm(document);
            document.getDocumentCatalog().setAcroForm(acroForm);

            PDNonTerminalField parent = new PDNonTerminalField(acroForm);
            parent.setPartialName("parent");
            PDTextField child = new PDTextField(acroForm);
            child.setPartialName("child");
            child.getWidgets().get(0).setPage(page);
            page.setAnnotations(List.of(child.getWidgets().get(0)));
            parent.setChildren(List.of(child));
            COSArray kids = parent.getCOSObject().getCOSArray(COSName.KIDS);
            kids.add(child.getCOSObject());
            kids.add(parent.getCOSObject());
            acroForm.setFields(List.of(parent));

            assertTimeoutPreemptively(LIMIT, () -> FormUtils.pruneOrphanedFormFields(document));

            COSArray remaining = parent.getCOSObject().getCOSArray(COSName.KIDS);
            assertThat(remaining.size()).isEqualTo(1);
            assertThat(remaining.getObject(0)).isSameAs(child.getCOSObject());
        }
    }
}
