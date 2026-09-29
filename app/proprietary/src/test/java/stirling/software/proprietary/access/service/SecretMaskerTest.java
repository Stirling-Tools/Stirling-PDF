package stirling.software.proprietary.access.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

class SecretMaskerTest {

    private final SecretMasker masker = new SecretMasker();

    @Test
    void maskHidesFlatAndNestedSecretsButKeepsPlainFields() {
        Map<String, Object> nested = new LinkedHashMap<>();
        nested.put("host", "h.example");
        nested.put("secretKey", "sk-real");
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("bucket", "acme");
        config.put("accessKey", "AKIA123");
        config.put("connection", nested); // non-sensitive parent, sensitive child

        Map<String, Object> masked = masker.mask(config);

        assertThat(masked.get("bucket")).isEqualTo("acme");
        assertThat(masked.get("accessKey")).isEqualTo(SecretMasker.MASK);
        @SuppressWarnings("unchecked")
        Map<String, Object> conn = (Map<String, Object>) masked.get("connection");
        assertThat(conn.get("host")).isEqualTo("h.example");
        assertThat(conn.get("secretKey")).isEqualTo(SecretMasker.MASK);
    }

    @Test
    void mergeKeepsStoredSecretWhenIncomingIsMasked() {
        Map<String, Object> stored = Map.of("bucket", "old", "secretKey", "REAL");
        Map<String, Object> incoming = Map.of("bucket", "new", "secretKey", SecretMasker.MASK);

        Map<String, Object> merged = masker.merge(stored, incoming);

        assertThat(merged.get("bucket")).isEqualTo("new"); // non-secret updated
        assertThat(merged.get("secretKey")).isEqualTo("REAL"); // secret retained
    }

    @Test
    void mergeAcceptsARealNewSecret() {
        Map<String, Object> merged =
                masker.merge(Map.of("secretKey", "OLD"), Map.of("secretKey", "NEW"));
        assertThat(merged.get("secretKey")).isEqualTo("NEW");
    }

    @Test
    void mergeDropsKeysAbsentFromIncoming() {
        // PUT/replace semantics: a key removed in the edit is removed from storage.
        Map<String, Object> stored = new java.util.LinkedHashMap<>();
        stored.put("bucket", "b");
        stored.put("endpoint", "https://old");
        stored.put("secretKey", "REAL");
        Map<String, Object> incoming = new java.util.LinkedHashMap<>();
        incoming.put("bucket", "b");
        incoming.put("secretKey", SecretMasker.MASK);

        Map<String, Object> merged = masker.merge(stored, incoming);

        assertThat(merged).doesNotContainKey("endpoint");
        assertThat(merged.get("secretKey")).isEqualTo("REAL"); // masked secret retained
    }

    @Test
    void sanitizeDropsBlankSecretsOnCreate() {
        Map<String, Object> incoming = new LinkedHashMap<>();
        incoming.put("bucket", "b");
        incoming.put("secretKey", "");

        Map<String, Object> clean = masker.sanitize(incoming);

        assertThat(clean).containsEntry("bucket", "b").doesNotContainKey("secretKey");
    }

    @Test
    void maskRedactsEveryHeaderValueRegardlessOfName() {
        Map<String, Object> headers = new LinkedHashMap<>();
        headers.put("X-API-Key", "real-secret"); // name carries no secret hint
        headers.put("Ocp-Apim-Subscription-Key", "abc123");
        headers.put("Content-Type", "application/json");
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("baseUrl", "https://api.example");
        config.put("headers", headers);

        Map<String, Object> masked = masker.mask(config);

        assertThat(masked.get("baseUrl")).isEqualTo("https://api.example");
        @SuppressWarnings("unchecked")
        Map<String, Object> maskedHeaders = (Map<String, Object>) masked.get("headers");
        assertThat(maskedHeaders.get("X-API-Key")).isEqualTo(SecretMasker.MASK);
        assertThat(maskedHeaders.get("Ocp-Apim-Subscription-Key")).isEqualTo(SecretMasker.MASK);
        assertThat(maskedHeaders.get("Content-Type")).isEqualTo(SecretMasker.MASK);
    }

    @Test
    void mergeRestoresRedactedHeaderValuesFromStored() {
        Map<String, Object> storedHeaders = new LinkedHashMap<>();
        storedHeaders.put("X-API-Key", "REAL");
        storedHeaders.put("Content-Type", "application/json");
        Map<String, Object> stored = new LinkedHashMap<>();
        stored.put("headers", storedHeaders);

        Map<String, Object> incomingHeaders = new LinkedHashMap<>();
        incomingHeaders.put("X-API-Key", SecretMasker.MASK); // untouched secret comes back masked
        incomingHeaders.put("Content-Type", "text/plain"); // genuinely edited
        Map<String, Object> incoming = new LinkedHashMap<>();
        incoming.put("headers", incomingHeaders);

        Map<String, Object> merged = masker.merge(stored, incoming);

        @SuppressWarnings("unchecked")
        Map<String, Object> mergedHeaders = (Map<String, Object>) merged.get("headers");
        assertThat(mergedHeaders.get("X-API-Key")).isEqualTo("REAL"); // restored, not "********"
        assertThat(mergedHeaders.get("Content-Type")).isEqualTo("text/plain"); // updated
    }

    @Test
    void deeplyNestedInputIsBoundedNotOverflowing() {
        // Build a structure far deeper than the recursion cap.
        Map<String, Object> root = new LinkedHashMap<>();
        Map<String, Object> cur = root;
        for (int i = 0; i < 2000; i++) {
            Map<String, Object> next = new LinkedHashMap<>();
            cur.put("child", next);
            cur = next;
        }
        cur.put("secretKey", "deep");

        // Must return (bounded recursion), not throw StackOverflowError.
        assertThat(masker.mask(root)).isNotNull();
        assertThat(masker.sanitize(root)).isNotNull();
        assertThat(masker.merge(root, root)).isNotNull();
    }
}
