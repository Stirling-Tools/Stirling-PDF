package stirling.software.proprietary.policy.webhook;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

class WebhookSignaturesTest {

    private static final String SECRET = "whsec_test_secret";
    private static final byte[] BODY = "the document bytes".getBytes(StandardCharsets.UTF_8);

    @Test
    void aFreshlySignedBodyVerifies() {
        String header = WebhookSignatures.sign(SECRET, BODY);
        assertTrue(header.startsWith("sha256="));
        assertTrue(WebhookSignatures.verify(SECRET, BODY, header));
    }

    @Test
    void abarehexSignatureVerifiesToo() {
        String header = WebhookSignatures.sign(SECRET, BODY);
        String bareHex = header.substring("sha256=".length());
        assertTrue(WebhookSignatures.verify(SECRET, BODY, bareHex));
    }

    @Test
    void aWrongSecretDoesNotVerify() {
        String header = WebhookSignatures.sign(SECRET, BODY);
        assertFalse(WebhookSignatures.verify("other-secret", BODY, header));
    }

    @Test
    void atamperedBodyDoesNotVerify() {
        String header = WebhookSignatures.sign(SECRET, BODY);
        byte[] tampered = "the document byteS".getBytes(StandardCharsets.UTF_8);
        assertFalse(WebhookSignatures.verify(SECRET, tampered, header));
    }

    @Test
    void aMissingOrMalformedHeaderIsFalseNotAnError() {
        assertFalse(WebhookSignatures.verify(SECRET, BODY, null));
        assertFalse(WebhookSignatures.verify(SECRET, BODY, "sha256=not-hex"));
        assertFalse(WebhookSignatures.verify(SECRET, BODY, ""));
    }
}
