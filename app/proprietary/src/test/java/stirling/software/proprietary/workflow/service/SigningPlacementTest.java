package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Base64;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.proprietary.workflow.dto.WetSignatureMetadata;

class SigningPlacementTest {
    @ParameterizedTest
    @ValueSource(ints = {0, 90, 180, 270})
    void finalImageMatchesRotatedCroppedPreviewWithoutStretching(int rotation) throws Exception {
        var signature = new BufferedImage(120, 40, BufferedImage.TYPE_INT_RGB);
        var graphics = signature.createGraphics();
        graphics.setColor(Color.RED);
        graphics.fillRect(0, 0, 120, 40);
        graphics.dispose();
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(signature, "png", bytes);
        var mark =
                new WetSignatureMetadata(
                        "image",
                        "data:image/png;base64,"
                                + Base64.getEncoder().encodeToString(bytes.toByteArray()),
                        0,
                        0.1,
                        0.2,
                        0.3,
                        0.1);
        var service = new SigningFinalizationService(null, null, null, null, null, null, null);
        try (var document = new PDDocument()) {
            var page = new PDPage(new PDRectangle(600, 800));
            page.setCropBox(new PDRectangle(40, 50, 400, 600));
            page.setRotation(rotation);
            document.addPage(page);
            ReflectionTestUtils.invokeMethod(service, "applyWetSignatureToPage", document, mark);
            var rendered = new PDFRenderer(document).renderImage(0);
            int minX = rendered.getWidth(), minY = rendered.getHeight(), maxX = -1, maxY = -1;
            for (int y = 0; y < rendered.getHeight(); y++) {
                for (int x = 0; x < rendered.getWidth(); x++) {
                    if ((rendered.getRGB(x, y) & 0xffffff) == 0xff0000) {
                        minX = Math.min(x, minX);
                        minY = Math.min(y, minY);
                        maxX = Math.max(x, maxX);
                        maxY = Math.max(y, maxY);
                    }
                }
            }
            assertThat((minX + maxX + 1) / 2.0)
                    .isCloseTo(
                            rendered.getWidth() * 0.25, org.assertj.core.data.Offset.offset(1.0));
            assertThat((minY + maxY + 1) / 2.0)
                    .isCloseTo(
                            rendered.getHeight() * 0.25, org.assertj.core.data.Offset.offset(1.0));
            assertThat((maxX - minX + 1.0) / (maxY - minY + 1))
                    .isCloseTo(3.0, org.assertj.core.data.Offset.offset(0.1));
        }
    }
}
