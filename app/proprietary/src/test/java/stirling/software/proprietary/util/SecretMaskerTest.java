package stirling.software.proprietary.util;

import static org.junit.jupiter.api.Assertions.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link SecretMasker}.
 *
 * <p>Assumptions: - Key matching is case-insensitive via the pattern in SENSITIVE. - If the key
 * matches a sensitive pattern, the value is replaced with "***REDACTED***". - Nested maps and lists
 * are searched recursively. - Null maps and null values are ignored or returned as null. -
 * Non-sensitive keys/values remain unchanged.
 */
class SecretMaskerTest {

    @Nested
    @DisplayName("mask(Map<String,Object>) method")
    class MaskMethod {

        @Test
        @DisplayName("should return null when input map is null")
        void shouldReturnNullWhenInputIsNull() {
            assertNull(SecretMasker.mask(null));
        }

        @Test
        @DisplayName("should mask simple sensitive keys at root level")
        void shouldMaskSimpleSensitiveKeys() {
            Map<String, Object> input =
                    Map.of(
                            "password", "mySecret",
                            "username", "john");

            Map<String, Object> result = SecretMasker.mask(input);

            assertEquals("***REDACTED***", result.get("password"));
            assertEquals("john", result.get("username"));
        }

        @Test
        @DisplayName("should mask keys case-insensitively and with special characters")
        void shouldMaskKeysCaseInsensitive() {
            Map<String, Object> input =
                    Map.of(
                            "Api-Key", "12345",
                            "TOKEN", "abcde",
                            "normal", "keepme");

            Map<String, Object> result = SecretMasker.mask(input);

            assertEquals("***REDACTED***", result.get("Api-Key"));
            assertEquals("***REDACTED***", result.get("TOKEN"));
            assertEquals("keepme", result.get("normal"));
        }

        @Test
        @DisplayName("should mask nested map sensitive keys")
        void shouldMaskNestedMapSensitiveKeys() {
            Map<String, Object> input =
                    Map.of(
                            "outer",
                            Map.of(
                                    "jwt",
                                    "tokenValue",
                                    "inner",
                                    Map.of(
                                            "secret", "deepValue",
                                            "other", "ok")));

            Map<String, Object> result = SecretMasker.mask(input);

            Map<String, Object> outer = (Map<String, Object>) result.get("outer");
            assertEquals("***REDACTED***", outer.get("jwt"));
            Map<String, Object> inner = (Map<String, Object>) outer.get("inner");
            assertEquals("***REDACTED***", inner.get("secret"));
            assertEquals("ok", inner.get("other"));
        }

        @Test
        @DisplayName("should mask sensitive keys inside lists")
        void shouldMaskSensitiveKeysInsideLists() {
            Map<String, Object> input =
                    Map.of(
                            "list",
                            List.of(
                                    Map.of("token", "abc123"),
                                    Map.of("username", "john"),
                                    "stringValue"));

            Map<String, Object> result = SecretMasker.mask(input);

            List<?> list = (List<?>) result.get("list");
            Map<String, Object> first = (Map<String, Object>) list.get(0);
            assertEquals("***REDACTED***", first.get("token"));
            Map<String, Object> second = (Map<String, Object>) list.get(1);
            assertEquals("john", second.get("username"));
            assertEquals("stringValue", list.get(2));
        }

        @Test
        @DisplayName("should ignore null values")
        void shouldIgnoreNullValues() {
            // IMPORTANT: Map.of(...) does not allow nulls -> use a mutable Map instead
            Map<String, Object> input = new HashMap<>();
            input.put("password", null);
            input.put("normal", null);

            Map<String, Object> result = SecretMasker.mask(input);

            // Null values are completely filtered out
            assertFalse(result.containsKey("password"));
            assertFalse(result.containsKey("normal"));
            assertTrue(result.isEmpty(), "Result map should be empty if all entries were null");
        }

        @Test
        @DisplayName("should not mask when key does not match pattern")
        void shouldNotMaskWhenKeyNotSensitive() {
            Map<String, Object> input = Map.of("email", "test@example.com");

            Map<String, Object> result = SecretMasker.mask(input);
            assertEquals("test@example.com", result.get("email"));
        }
    }

    @Nested
    @DisplayName("Deep masking edge branches")
    class DeepMaskBranches {

        @Test
        @DisplayName("should filter out null values inside nested map")
        void shouldFilterOutNullValuesInsideNestedMap() {
            // outer -> { inner -> { "token": null, "username": "john" } }
            Map<String, Object> inner = new HashMap<>();
            inner.put("token", null); // <- should be filtered out in the result (branch false)
            inner.put("username", "john"); // <- should remain

            Map<String, Object> input = Map.of("outer", Map.of("inner", inner));

            Map<String, Object> result = SecretMasker.mask(input);

            Map<String, Object> outer = (Map<String, Object>) result.get("outer");
            Map<String, Object> maskedInner = (Map<String, Object>) outer.get("inner");

            // "token" was null -> should be completely absent (filter branch in deepMask(Map))
            assertFalse(maskedInner.containsKey("token"));
            // "username" remains unchanged
            assertEquals("john", maskedInner.get("username"));
        }

        @Test
        @DisplayName("should not mask when key is null (falls back to deepMask(value))")
        void shouldNotMaskWhenKeyIsNull() {
            // Map with null key: { null: "plainText", "password": "toHide" }
            Map<String, Object> sensitive = new HashMap<>();
            sensitive.put(null, "plainText"); // <- key == null -> no masking, value stays
            sensitive.put("password", "toHide"); // <- sensitive key -> will be masked

            Map<String, Object> input = Map.of("outer", sensitive);

            Map<String, Object> result = SecretMasker.mask(input);

            Map<String, Object> outer = (Map<String, Object>) result.get("outer");
            assertTrue(outer.containsKey(null), "Null key should be preserved");
            assertEquals("plainText", outer.get(null), "Value for null key must not be masked");
            assertEquals("***REDACTED***", outer.get("password"), "Sensitive keys must be masked");
        }
    }
}
