package stirling.software.common.util.misc;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.InputStreamResource;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.model.api.misc.ReplaceAndInvert;

class ColorSpaceConversionStrategyTest {

    @Test
    void convertsRgbContentToCmykWithoutGhostscript() throws Exception {
        byte[] source = rgbPdf();
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "rgb.pdf", "application/pdf", source);

        ColorSpaceConversionStrategy strategy =
                new ColorSpaceConversionStrategy(file, ReplaceAndInvert.COLOR_SPACE_CONVERSION);

        InputStreamResource result = strategy.replace();
        byte[] converted = result.getInputStream().readAllBytes();

        assertThat(converted).isNotEmpty();
        try (PDDocument output = Loader.loadPDF(converted)) {
            assertThat(output.getNumberOfPages()).isOne();
            PDPage page = output.getPage(0);
            Set<String> operators = operators(page);
            assertThat(operators).doesNotContain("rg", "RG");
            assertThat(operators).containsAnyOf("k", "K", "scn", "SCN");
        }
    }

    @Test
    void convertsLosslessImagesToCmyk() throws Exception {
        byte[] source = pdfWithImage();
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "image.pdf", "application/pdf", source);

        ColorSpaceConversionStrategy strategy =
                new ColorSpaceConversionStrategy(file, ReplaceAndInvert.COLOR_SPACE_CONVERSION);
        byte[] converted = strategy.replace().getInputStream().readAllBytes();

        try (PDDocument output = Loader.loadPDF(converted)) {
            PDResources resources = output.getPage(0).getResources();
            PDImageXObject image =
                    (PDImageXObject)
                            resources.getXObject(resources.getXObjectNames().iterator().next());
            assertThat(image.getColorSpace().getName()).isEqualTo("DeviceCMYK");
        }
    }

    private static Set<String> operators(PDPage page) throws Exception {
        List<Object> tokens = new PDFStreamParser(page).parse();
        return tokens.stream()
                .filter(Operator.class::isInstance)
                .map(Operator.class::cast)
                .map(Operator::getName)
                .collect(Collectors.toSet());
    }

    private static byte[] pdfWithImage() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            BufferedImage bitmap = new BufferedImage(32, 32, BufferedImage.TYPE_INT_RGB);
            for (int y = 0; y < 32; y++) {
                for (int x = 0; x < 32; x++) {
                    bitmap.setRGB(x, y, x < 16 ? 0xFF0000 : 0x00FF00);
                }
            }
            PDImageXObject image = LosslessFactory.createFromImage(document, bitmap);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.drawImage(image, 100, 100, 120, 120);
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            document.save(output);
            return output.toByteArray();
        }
    }

    private static byte[] rgbPdf() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.setNonStrokingColor(1f, 0f, 0f);
                content.addRect(40, 40, 120, 80);
                content.fill();
                content.setStrokingColor(0f, 1f, 0f);
                content.addRect(200, 40, 120, 80);
                content.stroke();
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            document.save(output);
            return output.toByteArray();
        }
    }
}
