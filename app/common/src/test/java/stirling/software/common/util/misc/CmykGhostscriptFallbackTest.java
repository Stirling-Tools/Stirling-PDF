package stirling.software.common.util.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.function.PDFunctionType2;
import org.apache.pdfbox.pdmodel.common.function.PDFunctionType4;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB;
import org.apache.pdfbox.pdmodel.graphics.shading.PDShadingType2;
import org.apache.pdfbox.pdmodel.graphics.shading.PDShadingType3;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("CMYK Ghostscript shading fallback")
class CmykGhostscriptFallbackTest {

    @Test
    @DisplayName("simple Type 2 axial shading stays on the JPDFium path")
    void simpleType2ShadingDoesNotNeedGhostscript() throws Exception {
        assertThat(CmykGhostscriptFallback.needsGhostscript(type2ShadingPdf())).isFalse();
    }

    @Test
    @DisplayName("radial Type 3 shading stays on the JPDFium path")
    void radialShadingDoesNotNeedGhostscript() throws Exception {
        assertThat(CmykGhostscriptFallback.needsGhostscript(type3ShadingPdf())).isFalse();
    }

    @Test
    @DisplayName("PostScript calculator shading requests the Ghostscript fallback")
    void postScriptShadingNeedsGhostscript() throws Exception {
        assertThat(CmykGhostscriptFallback.needsGhostscript(postScriptShadingPdf())).isTrue();
    }

    @Test
    @DisplayName("Ghostscript fallback converts PostScript shading when installed")
    void ghostscriptFallbackConvertsWhenInstalled() throws Exception {
        assumeTrue(ghostscriptAvailable(), "Ghostscript is not installed");
        byte[] converted = CmykGhostscriptFallback.convert(postScriptShadingPdf());
        assertThat(converted).isNotEmpty();
        assertThat(converted).startsWith("%PDF".getBytes());
        try (PDDocument output = Loader.loadPDF(converted)) {
            assertThat(output.getNumberOfPages()).isOne();
        }
    }

    private static boolean ghostscriptAvailable() {
        try {
            Process process = new ProcessBuilder("gs", "--version").start();
            return process.waitFor() == 0;
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return false;
        }
    }

    private static byte[] type2ShadingPdf() throws Exception {
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
            shading.setFunction(new PDFunctionType2(function()));
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.shadingFill(shading);
            }
            return save(document);
        }
    }

    private static byte[] type3ShadingPdf() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(new PDRectangle(200, 200));
            document.addPage(page);
            PDShadingType3 shading = new PDShadingType3(new COSDictionary());
            shading.setShadingType(3);
            shading.setColorSpace(PDDeviceRGB.INSTANCE);
            COSArray coords = new COSArray();
            coords.add(COSFloat.get("100"));
            coords.add(COSFloat.get("100"));
            coords.add(COSFloat.get("0"));
            coords.add(COSFloat.get("100"));
            coords.add(COSFloat.get("100"));
            coords.add(COSFloat.get("100"));
            shading.setCoords(coords);
            shading.setFunction(new PDFunctionType2(function()));
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.shadingFill(shading);
            }
            return save(document);
        }
    }

    private static byte[] postScriptShadingPdf() throws Exception {
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
            function.setItem(COSName.FUNCTION_TYPE, COSInteger.get(4));
            function.setItem(COSName.DOMAIN, unitRange(1));
            function.setItem(COSName.RANGE, unitRange(3));
            try (OutputStream stream = function.createOutputStream()) {
                stream.write("{ pop 0 0 0 }".getBytes(StandardCharsets.US_ASCII));
            }
            shading.setFunction(new PDFunctionType4(function));
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.shadingFill(shading);
            }
            return save(document);
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

    private static COSDictionary function() throws java.io.IOException {
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
        return function;
    }

    private static byte[] save(PDDocument document) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        document.save(output);
        return output.toByteArray();
    }
}
