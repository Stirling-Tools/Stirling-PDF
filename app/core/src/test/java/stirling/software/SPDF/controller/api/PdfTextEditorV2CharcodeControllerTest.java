package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.util.Base64;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.controller.api.PdfTextEditorV2CharcodeController.EncodeCharcodesRequest;
import stirling.software.SPDF.controller.api.PdfTextEditorV2CharcodeController.EncodeCharcodesResponse;

/**
 * Regression coverage for the v2 text editor "spaces render as „" bug.
 *
 * <p>mushroom-life.pdf is a LaTeX document whose embedded LMRoman subset font has NO real space
 * glyph, yet {@code font.encode(" ")} still returns charcode 0x20 without throwing. Reusing that
 * code via {@code FPDFText_SetCharcodes} paints whatever glyph sits at subset code 0x20 - the
 * quotedblbase „. The controller must therefore report whitespace as {@code missing} so the
 * frontend emits it as a positional gap instead of a reused glyph.
 */
class PdfTextEditorV2CharcodeControllerTest {

    private static String mushroomBase64() throws Exception {
        try (InputStream in =
                PdfTextEditorV2CharcodeControllerTest.class.getResourceAsStream(
                        "/pdftexteditor/mushroom-life.pdf")) {
            assertThat(in).as("mushroom-life.pdf test resource").isNotNull();
            return Base64.getEncoder().encodeToString(in.readAllBytes());
        }
    }

    private static EncodeCharcodesRequest request(String text) throws Exception {
        EncodeCharcodesRequest req = new EncodeCharcodesRequest();
        req.setPdfBase64(mushroomBase64());
        req.setPageIndex(0);
        // findFontByToUnicode locates the font via the ToUnicode CMap, so the
        // locator coordinates are unused - "M" exists on the first page.
        req.setLocatorChar("M");
        req.setLocatorX(1);
        req.setLocatorY(1);
        req.setText(text);
        return req;
    }

    @Test
    void spaceIsReportedMissingNeverEncoded() throws Exception {
        PdfTextEditorV2CharcodeController controller = new PdfTextEditorV2CharcodeController();
        ResponseEntity<EncodeCharcodesResponse> resp = controller.encodeCharcodes(request(" "));

        EncodeCharcodesResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.getError()).isNull();
        // The space must be reported missing, NOT handed back as a charcode
        // (0x20) the frontend would reuse into the „ glyph.
        assertThat(body.getMissing()).containsExactly(" ");
        assertThat(body.getCharcodes()).isNullOrEmpty();
    }

    @Test
    void realCharsEncodeWhileWhitespaceStaysAGap() throws Exception {
        PdfTextEditorV2CharcodeController controller = new PdfTextEditorV2CharcodeController();
        // "M M" - both M's must encode to real charcodes; only the space is a gap.
        ResponseEntity<EncodeCharcodesResponse> resp = controller.encodeCharcodes(request("M M"));

        EncodeCharcodesResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.getError()).isNull();
        assertThat(body.getCharcodes()).as("both M glyphs encode").hasSize(2);
        assertThat(body.getMissing()).containsExactly(" ");
    }

    @Test
    void tabAndNewlineAreAlsoTreatedAsGaps() throws Exception {
        PdfTextEditorV2CharcodeController controller = new PdfTextEditorV2CharcodeController();
        ResponseEntity<EncodeCharcodesResponse> resp = controller.encodeCharcodes(request("\t\n"));

        EncodeCharcodesResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.getMissing()).containsExactly("\t", "\n");
        assertThat(body.getCharcodes()).isNullOrEmpty();
    }
}
