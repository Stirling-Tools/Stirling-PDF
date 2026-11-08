package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.Test;

import stirling.software.jpdfium.doc.PdfXConverter;
import stirling.software.jpdfium.doc.PdfXOptions;
import stirling.software.jpdfium.doc.PdfXStandard;

class PdfXImageConversionTest {

    @Test
    void convertsLosslessImagesToCmyk() throws Exception {
        byte[] source;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            BufferedImage bitmap = new BufferedImage(80, 80, BufferedImage.TYPE_INT_RGB);
            for (int y = 0; y < 80; y++) {
                for (int x = 0; x < 80; x++) {
                    bitmap.setRGB(x, y, x < 40 ? 0xFF0000 : 0x00FF00);
                }
            }
            PDImageXObject image = LosslessFactory.createFromImage(doc, bitmap);
            try (PDPageContentStream content = new PDPageContentStream(doc, page)) {
                content.drawImage(image, 100, 100, 160, 160);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            source = out.toByteArray();
        }

        PdfXOptions options =
                PdfXOptions.builder()
                        .standard(PdfXStandard.PDF_X_4)
                        .useCompactCmyk()
                        .convertForms(true)
                        .convertSpecialColors(true)
                        .convertLosslessImages(true)
                        .strictImages(true)
                        .build();

        byte[] converted = PdfXConverter.applyMetadata(source, options);

        try (PDDocument output = Loader.loadPDF(converted)) {
            assertThat(output.getDocumentCatalog().getOutputIntents()).isNotEmpty();
            assertThat(output.getVersion()).isEqualTo(1.6f);
            PDResources resources = output.getPage(0).getResources();
            PDImageXObject image =
                    (PDImageXObject)
                            resources.getXObject(resources.getXObjectNames().iterator().next());
            assertThat(image.getColorSpace().getName()).isEqualTo("DeviceCMYK");
        }
    }
}
