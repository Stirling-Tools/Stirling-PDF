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
    void sanitizeDropsBlankSecretsOnCreate() {
        Map<String, Object> incoming = new LinkedHashMap<>();
        incoming.put("bucket", "b");
        incoming.put("secretKey", "");

        Map<String, Object> clean = masker.sanitize(incoming);

        assertThat(clean).containsEntry("bucket", "b").doesNotContainKey("secretKey");
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
