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
        @DisplayName("should not mutate the original input map (no side effects)")
        void shouldNotMutateOriginalInputMap() {
            Map<String, Object> nested = new HashMap<>();
            nested.put("token", "t1");
            nested.put("username", "jason");

            Map<String, Object> input = new HashMap<>();
            input.put("password", "mySecret");
            input.put("nested", nested);

            String beforePassword = (String) input.get("password");
            Map<String, Object> beforeNested = (Map<String, Object>) input.get("nested");
            String beforeToken = (String) beforeNested.get("token");

            // use mask
            Map<String, Object> result = SecretMasker.mask(input);

            // check the result
            assertEquals("***REDACTED***", result.get("password"));
            Map<String, Object> resultNested = (Map<String, Object>) result.get("nested");
            assertEquals("***REDACTED***", resultNested.get("token"));
            assertEquals("jason", resultNested.get("username"));

            // check the input
            assertEquals(beforePassword, input.get("password"));
            Map<String, Object> afterNested = (Map<String, Object>) input.get("nested");
            assertEquals(beforeToken, afterNested.get("token"));
            assertEquals("jason", afterNested.get("username"));
        }

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
        @DisplayName(
                "should NOT mask keys that merely contain 'key' as a substring (false positives)")
        void shouldNotMaskFalsePositiveKeySubstrings() {
            Map<String, Object> input =
                    Map.of(
                            "monkey", "v1",
                            "hockey", "v2",
                            "turkey", "v3",
                            "keynote", "v4",
                            "donkey", "v5");

            Map<String, Object> result = SecretMasker.mask(input);

            assertEquals("v1", result.get("monkey"));
            assertEquals("v2", result.get("hockey"));
            assertEquals("v3", result.get("turkey"));
            assertEquals("v4", result.get("keynote"));
            assertEquals("v5", result.get("donkey"));
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
        @DisplayName("should mask regardless of value type when key matches sensitive pattern")
        void shouldMaskRegardlessOfValueType() {
            Map<String, Object> input = new HashMap<>();
            input.put("token", List.of("a", "b"));
            input.put("secret", Map.of("x", 1));
            input.put("password", 12345);

            Map<String, Object> result = SecretMasker.mask(input);

            assertEquals("***REDACTED***", result.get("token"));
            assertEquals("***REDACTED***", result.get("secret"));
            assertEquals("***REDACTED***", result.get("password"));
        }

        @Test
        @DisplayName("should mask authorization key case-insensitively")
        void shouldMaskAuthorizationCaseInsensitive() {
            Map<String, Object> input = Map.of("AuThOrIzAtIoN", "Bearer abc");

            Map<String, Object> result = SecretMasker.mask(input);

            assertEquals("***REDACTED***", result.get("AuThOrIzAtIoN"));
        }

        @Test
        @DisplayName("should deep-mask list containing a map (redact sensitive + keep normal)")
        void shouldDeepMaskListContainingMap() {
            Map<String, Object> input =
                    Map.of("list", List.of(Map.of("cred", "xx", "keep", "ok"), 7));

            Map<String, Object> result = SecretMasker.mask(input);

            List<?> list = (List<?>) result.get("list");
            Map<?, ?> first = (Map<?, ?>) list.get(0);

            assertEquals("***REDACTED***", first.get("cred")); // sensitive -> redact
            assertEquals("ok", first.get("keep")); // non-sensitive -> keep
            assertEquals(7, list.get(1)); // leaf -> keep
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
