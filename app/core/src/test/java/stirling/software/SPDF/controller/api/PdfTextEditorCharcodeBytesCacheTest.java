package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Base64;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.controller.api.PdfTextEditorCharcodeController.EncodeCharcodesRequest;
import stirling.software.SPDF.controller.api.PdfTextEditorCharcodeController.EncodeCharcodesResponse;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

/**
 * Content-addressed PDF bytes for {@code encode-charcodes}: repeat requests for an unchanged
 * document send only the SHA-256, not the whole file. A typing burst serializes identical bytes for
 * several prefetches; without this each one re-uploads the full PDF.
 */
class PdfTextEditorCharcodeBytesCacheTest {

    private static PdfTextEditorCharcodeController controller() {
        return new PdfTextEditorCharcodeController(
                new CustomPDFDocumentFactory(mock(PdfMetadataService.class)));
    }

    private static byte[] mushroomBytes() throws Exception {
        try (InputStream in =
                PdfTextEditorCharcodeBytesCacheTest.class.getResourceAsStream(
                        "/pdftexteditor/mushroom-life.pdf")) {
            assertThat(in).as("mushroom-life.pdf test resource").isNotNull();
            return in.readAllBytes();
        }
    }

    private static String shaHex(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder sb = new StringBuilder(digest.length * 2);
        for (byte b : digest)
            sb.append(Character.forDigit((b >> 4) & 0xf, 16))
                    .append(Character.forDigit(b & 0xf, 16));
        return sb.toString();
    }

    private static EncodeCharcodesRequest fullRequest(byte[] pdf, String sha) {
        EncodeCharcodesRequest req = new EncodeCharcodesRequest();
        req.setPdfBase64(Base64.getEncoder().encodeToString(pdf));
        req.setPdfSha256(sha);
        req.setPageIndex(0);
        req.setLocatorChar("M");
        req.setText("M");
        return req;
    }

    @Test
    void shaOnlyRequestReusesCachedBytes() throws Exception {
        byte[] pdf = mushroomBytes();
        String sha = shaHex(pdf);
        PdfTextEditorCharcodeController controller = controller();

        ResponseEntity<EncodeCharcodesResponse> full =
                controller.encodeCharcodes(fullRequest(pdf, sha));
        assertThat(full.getBody().getError()).isNull();

        EncodeCharcodesRequest shaOnly = new EncodeCharcodesRequest();
        shaOnly.setPageIndex(0);
        shaOnly.setLocatorChar("M");
        shaOnly.setText("M");
        shaOnly.setPdfSha256(sha);
        ResponseEntity<EncodeCharcodesResponse> cached = controller.encodeCharcodes(shaOnly);
        assertThat(cached.getStatusCode().value()).isEqualTo(200);
        assertThat(cached.getBody().getError()).isNull();
        assertThat(cached.getBody().getCharcodes()).isEqualTo(full.getBody().getCharcodes());
    }

    @Test
    void unknownShaReturns409WithBytesExpired() {
        EncodeCharcodesRequest req = new EncodeCharcodesRequest();
        req.setPageIndex(0);
        req.setLocatorChar("M");
        req.setText("M");
        req.setPdfSha256("0".repeat(64));
        ResponseEntity<EncodeCharcodesResponse> resp = controller().encodeCharcodes(req);
        assertThat(resp.getStatusCode().value()).isEqualTo(409);
        assertThat(resp.getBody().getBytesExpired()).isTrue();
    }

    @Test
    void mismatchedShaIsRejected() throws Exception {
        byte[] pdf = mushroomBytes();
        EncodeCharcodesRequest req = fullRequest(pdf, "f".repeat(64));
        ResponseEntity<EncodeCharcodesResponse> resp = controller().encodeCharcodes(req);
        assertThat(resp.getStatusCode().value()).isEqualTo(400);
        assertThat(resp.getBody().getError()).contains("does not match");
    }

    @Test
    void neitherBytesNorShaIsRejected() {
        EncodeCharcodesRequest req = new EncodeCharcodesRequest();
        req.setPageIndex(0);
        req.setLocatorChar("M");
        req.setText("M");
        ResponseEntity<EncodeCharcodesResponse> resp = controller().encodeCharcodes(req);
        assertThat(resp.getStatusCode().value()).isEqualTo(400);
    }
}
