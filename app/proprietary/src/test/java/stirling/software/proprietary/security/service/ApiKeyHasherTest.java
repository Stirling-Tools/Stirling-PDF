package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("ApiKeyHasher")
class ApiKeyHasherTest {

    @Test
    @DisplayName("generated keys are unique, prefixed, and hash deterministically")
    void generateAndHash() {
        String a = ApiKeyHasher.generateRawKey();
        String b = ApiKeyHasher.generateRawKey();

        assertThat(a).startsWith("sk_").isNotEqualTo(b);
        // Same input hashes the same; SHA-256 hex is 64 chars.
        assertThat(ApiKeyHasher.hash(a)).isEqualTo(ApiKeyHasher.hash(a)).hasSize(64);
        assertThat(ApiKeyHasher.hash(a)).isNotEqualTo(ApiKeyHasher.hash(b));
    }

    @Test
    @DisplayName("hash never returns the raw key")
    void hashHidesRaw() {
        String raw = ApiKeyHasher.generateRawKey();
        assertThat(ApiKeyHasher.hash(raw)).isNotEqualTo(raw);
    }

    @Test
    @DisplayName("display prefix is a short non-secret leading fragment")
    void displayPrefix() {
        String raw = ApiKeyHasher.generateRawKey();
        String prefix = ApiKeyHasher.displayPrefix(raw);
        assertThat(prefix).hasSize(11).startsWith("sk_");
        assertThat(raw).startsWith(prefix);
    }
}
