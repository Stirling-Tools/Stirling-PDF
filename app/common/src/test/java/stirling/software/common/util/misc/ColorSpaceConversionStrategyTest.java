package stirling.software.common.util.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.mockStatic;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.function.PDFunctionType0;
import org.apache.pdfbox.pdmodel.common.function.PDFunctionType2;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.shading.PDShadingType2;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.InputStreamResource;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.doc.PdfColorConverter;
import stirling.software.jpdfium.doc.PdfIccProfiles;
import stirling.software.jpdfium.model.SaveOptions;

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

    @Test
    void convertedColourChartStaysCloseToSource() throws Exception {
        byte[] source = colourChartPdf();
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "chart.pdf", "application/pdf", source);

        ColorSpaceConversionStrategy strategy =
                new ColorSpaceConversionStrategy(file, ReplaceAndInvert.COLOR_SPACE_CONVERSION);
        byte[] converted = strategy.replace().getInputStream().readAllBytes();

        BufferedImage before = render(source);
        BufferedImage after = render(converted);
        double delta = 0;
        int samples = 0;
        for (int y = 0; y < 8; y++) {
            for (int x = 0; x < 8; x++) {
                int px = x * 50 + 25;
                int py = (7 - y) * 50 + 25;
                Color a = new Color(before.getRGB(px, py));
                Color b = new Color(after.getRGB(px, py));
                delta +=
                        (Math.abs(a.getRed() - b.getRed())
                                        + Math.abs(a.getGreen() - b.getGreen())
                                        + Math.abs(a.getBlue() - b.getBlue()))
                                / 3.0;
                samples++;
            }
        }
        assertThat(delta / samples)
                .as(
                        "mean RGB delta after CMYK conversion with profile %s",
                        CmykProfileResolver.source())
                .isLessThan(20.0);
    }

    @Test
    void newCompactProfileBeatsTheOldProfileWithoutGhostscript() throws Exception {
        byte[] source = colourChartPdf();
        byte[] oldProfile;
        try (InputStream in = getClass().getResourceAsStream("/old-compact-cmyk.icc")) {
            assertThat(in).as("old compact profile fixture").isNotNull();
            oldProfile = in.readAllBytes();
        }

        double oldDelta = meanDelta(source, convertWithProfile(source, oldProfile));
        double newDelta =
                meanDelta(source, convertWithProfile(source, PdfIccProfiles.compactCmyk()));

        assertThat(newDelta)
                .as("new compact profile must be closer to the source than the old profile")
                .isLessThan(oldDelta);
    }

    @Test
    void unsupportedShadingWithoutGhostscriptRasterizesThePage() throws Exception {
        byte[] source = pdfWithShading();
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "shading.pdf", "application/pdf", source);
        ColorSpaceConversionStrategy strategy =
                new ColorSpaceConversionStrategy(file, ReplaceAndInvert.COLOR_SPACE_CONVERSION);

        try (var fallback = mockStatic(CmykGhostscriptFallback.class, CALLS_REAL_METHODS)) {
            fallback.when(() -> CmykGhostscriptFallback.unsupportedShadingPages(any()))
                    .thenReturn(Set.of(0));
            fallback.when(() -> CmykGhostscriptFallback.convert(any()))
                    .thenThrow(new IOException("Ghostscript is not installed"));

            byte[] converted = strategy.replace().getInputStream().readAllBytes();
            try (PDDocument output = Loader.loadPDF(converted)) {
                PDResources resources = output.getPage(0).getResources();
                assertThat(resources.getShadingNames()).isEmpty();
                assertThat(resources.getXObjectNames()).isNotEmpty();
            }
        }
    }

    @Test
    void convertsSimpleAxialShadingToCmyk() throws Exception {
        byte[] source = pdfWithShading();
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "shading.pdf", "application/pdf", source);

        ColorSpaceConversionStrategy strategy =
                new ColorSpaceConversionStrategy(file, ReplaceAndInvert.COLOR_SPACE_CONVERSION);
        byte[] converted = strategy.replace().getInputStream().readAllBytes();

        try (PDDocument output = Loader.loadPDF(converted)) {
            PDResources resources = output.getPage(0).getResources();
            PDShadingType2 shading =
                    (PDShadingType2)
                            resources.getShading(resources.getShadingNames().iterator().next());
            assertThat(shading.getColorSpace().getName()).isEqualTo("DeviceCMYK");
        }
    }

    @Test
    void convertsSampledAxialShadingToCmyk() throws Exception {
        byte[] source = pdfWithSampledShading();
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "sampled.pdf", "application/pdf", source);

        ColorSpaceConversionStrategy strategy =
                new ColorSpaceConversionStrategy(file, ReplaceAndInvert.COLOR_SPACE_CONVERSION);
        byte[] converted = strategy.replace().getInputStream().readAllBytes();

        try (PDDocument output = Loader.loadPDF(converted)) {
            PDResources resources = output.getPage(0).getResources();
            PDShadingType2 shading =
                    (PDShadingType2)
                            resources.getShading(resources.getShadingNames().iterator().next());
            assertThat(shading.getColorSpace().getName()).isEqualTo("DeviceCMYK");
            assertThat(shading.getFunction()).isInstanceOf(PDFunctionType0.class);
            assertThat(
                            shading.getFunction()
                                    .getCOSObject()
                                    .getCOSArray(COSName.getPDFName("Range"))
                                    .size())
                    .isEqualTo(8);
        }
    }

    private static byte[] convertWithProfile(byte[] source, byte[] profile) throws Exception {
        try (PdfDocument document = PdfDocument.open(source)) {
            PdfColorConverter.ColorConvertOptions options =
                    PdfColorConverter.ColorConvertOptions.builder()
                            .targetColorSpace(PdfColorConverter.ColorSpace.CMYK)
                            .iccProfile(profile)
                            .convertForms(true)
                            .convertSpecialColors(true)
                            .convertLosslessImages(true)
                            .strictImages(true)
                            .build();
            PdfColorConverter.convert(document, options);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            document.saveTo(output, SaveOptions.validated());
            return output.toByteArray();
        }
    }

    private static double meanDelta(byte[] beforePdf, byte[] afterPdf) throws Exception {
        BufferedImage before = render(beforePdf);
        BufferedImage after = render(afterPdf);
        double delta = 0;
        int samples = 0;
        for (int y = 0; y < 8; y++) {
            for (int x = 0; x < 8; x++) {
                int px = x * 50 + 25;
                int py = (7 - y) * 50 + 25;
                Color a = new Color(before.getRGB(px, py));
                Color b = new Color(after.getRGB(px, py));
                delta +=
                        (Math.abs(a.getRed() - b.getRed())
                                        + Math.abs(a.getGreen() - b.getGreen())
                                        + Math.abs(a.getBlue() - b.getBlue()))
                                / 3.0;
                samples++;
            }
        }
        return delta / samples;
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

    private static byte[] pdfWithSampledShading() throws Exception {
        try (PDDocument document = new PDDocument();
                COSStream function = new COSStream()) {
            PDPage page = new PDPage(new PDRectangle(200, 200));
            document.addPage(page);
            PDShadingType2 shading = new PDShadingType2(new COSDictionary());
            shading.setShadingType(2);
            shading.setColorSpace(PDDeviceRGB.INSTANCE);
            COSArray coords = new COSArray();
            coords.add(COSFloat.get("20"));
            coords.add(COSFloat.get("0"));
            coords.add(COSFloat.get("180"));
            coords.add(COSFloat.get("0"));
            shading.setCoords(coords);

            function.setItem(COSName.FUNCTION_TYPE, COSInteger.get(0));
            function.setItem(COSName.DOMAIN, unitRange(1));
            function.setItem(COSName.RANGE, unitRange(3));
            COSArray size = new COSArray();
            size.add(COSInteger.get(2));
            function.setItem(COSName.SIZE, size);
            function.setItem(COSName.BITS_PER_SAMPLE, COSInteger.get(8));
            function.setItem(COSName.ORDER, COSInteger.get(1));
            function.setItem(COSName.DECODE, unitRange(3));
            try (OutputStream stream = function.createOutputStream()) {
                stream.write(new byte[] {(byte) 255, 0, 0, 0, 0, (byte) 255});
            }
            shading.setFunction(new PDFunctionType0(function));

            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.shadingFill(shading);
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            document.save(output);
            return output.toByteArray();
        }
    }

    private static COSArray unitRange(int components) {
        COSArray range = new COSArray();
        for (int i = 0; i < components; i++) {
            range.add(COSInteger.ZERO);
            range.add(COSInteger.ONE);
        }
        return range;
    }

    private static byte[] pdfWithShading() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(new PDRectangle(200, 200));
            document.addPage(page);
            PDShadingType2 shading = new PDShadingType2(new COSDictionary());
            shading.setShadingType(2);
            shading.setColorSpace(PDDeviceRGB.INSTANCE);
            COSArray coords = new COSArray();
            coords.add(COSFloat.get("20"));
            coords.add(COSFloat.get("0"));
            coords.add(COSFloat.get("180"));
            coords.add(COSFloat.get("0"));
            shading.setCoords(coords);
            COSDictionary function = new COSDictionary();
            function.setInt(COSName.getPDFName("FunctionType"), 2);
            function.setInt(COSName.getPDFName("N"), 1);
            COSArray c0 = new COSArray();
            c0.add(COSFloat.get("1"));
            c0.add(COSFloat.get("0"));
            c0.add(COSFloat.get("0"));
            COSArray c1 = new COSArray();
            c1.add(COSFloat.get("0"));
            c1.add(COSFloat.get("0"));
            c1.add(COSFloat.get("1"));
            function.setItem(COSName.getPDFName("C0"), c0);
            function.setItem(COSName.getPDFName("C1"), c1);
            shading.setFunction(new PDFunctionType2(function));
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.shadingFill(shading);
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            document.save(output);
            return output.toByteArray();
        }
    }

    private static BufferedImage render(byte[] pdf) throws Exception {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            return new PDFRenderer(document).renderImageWithDPI(0, 72);
        }
    }

    private static byte[] colourChartPdf() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(new PDRectangle(400, 400));
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                int cells = 8;
                int cellSize = 50;
                for (int y = 0; y < cells; y++) {
                    for (int x = 0; x < cells; x++) {
                        Color colour =
                                Color.getHSBColor(
                                        x / (float) cells, y / (float) (cells - 1), 0.85f);
                        content.setNonStrokingColor(colour);
                        content.addRect(x * cellSize, y * cellSize, cellSize, cellSize);
                        content.fill();
                    }
                }
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
