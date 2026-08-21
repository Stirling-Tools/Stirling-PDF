package stirling.software.saas.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link LogRedactionUtils}.
 *
 * <p>PII masking for log lines. Covers null/blank/edge inputs and the happy path for both email and
 * Supabase-id redaction, plus the UUID overload.
 */
class LogRedactionUtilsTest {

    @Nested
    @DisplayName("redactEmail")
    class RedactEmail {

        @Test
        @DisplayName("masks a normal email keeping the first char and the domain")
        void normalEmail_masked() {
            assertThat(LogRedactionUtils.redactEmail("john@stirling.com"))
                    .isEqualTo("j***@stirling.com");
        }

        @Test
        @DisplayName("returns null unchanged")
        void nullEmail_unchanged() {
            assertThat(LogRedactionUtils.redactEmail(null)).isNull();
        }

        @Test
        @DisplayName("returns blank unchanged")
        void blankEmail_unchanged() {
            assertThat(LogRedactionUtils.redactEmail("   ")).isEqualTo("   ");
        }

        @Test
        @DisplayName("returns input with no '@' unchanged")
        void noAtSign_unchanged() {
            assertThat(LogRedactionUtils.redactEmail("notanemail")).isEqualTo("notanemail");
        }

        @Test
        @DisplayName("returns input starting with '@' unchanged (at index 0)")
        void atSignAtStart_unchanged() {
            assertThat(LogRedactionUtils.redactEmail("@stirling.com")).isEqualTo("@stirling.com");
        }

        @Test
        @DisplayName("returns input ending with '@' unchanged (at is last index)")
        void atSignAtEnd_unchanged() {
            assertThat(LogRedactionUtils.redactEmail("john@")).isEqualTo("john@");
        }

        @Test
        @DisplayName("masks a single-char local part to its only char")
        void singleCharLocalPart_masked() {
            assertThat(LogRedactionUtils.redactEmail("a@b.com")).isEqualTo("a***@b.com");
        }
    }

    @Nested
    @DisplayName("redactSupabaseId(String)")
    class RedactSupabaseIdString {

        @Test
        @DisplayName("masks the middle of a full UUID string")
        void fullUuid_masked() {
            String id = "12345678-90ab-cdef-1234-567890abcdef";
            assertThat(LogRedactionUtils.redactSupabaseId(id)).isEqualTo("12345678-***-cdef");
        }

        @Test
        @DisplayName("returns null unchanged")
        void nullId_unchanged() {
            assertThat(LogRedactionUtils.redactSupabaseId((String) null)).isNull();
        }

        @Test
        @DisplayName("returns a string shorter than 12 chars unchanged")
        void shortId_unchanged() {
            assertThat(LogRedactionUtils.redactSupabaseId("short")).isEqualTo("short");
        }

        @Test
        @DisplayName("an 11-char string (one below the threshold) is returned unchanged")
        void elevenChars_unchanged() {
            assertThat(LogRedactionUtils.redactSupabaseId("12345678901")).isEqualTo("12345678901");
        }

        @Test
        @DisplayName("a 12-char string (exactly at the threshold) is masked")
        void twelveChars_masked() {
            assertThat(LogRedactionUtils.redactSupabaseId("123456789012"))
                    .isEqualTo("12345678-***-9012");
        }
    }

    @Nested
    @DisplayName("redactSupabaseId(UUID)")
    class RedactSupabaseIdUuid {

        @Test
        @DisplayName("masks a UUID by delegating to the string overload")
        void uuid_masked() {
            UUID id = UUID.fromString("12345678-90ab-cdef-1234-567890abcdef");
            assertThat(LogRedactionUtils.redactSupabaseId(id)).isEqualTo("12345678-***-cdef");
        }

        @Test
        @DisplayName("returns null for a null UUID")
        void nullUuid_returnsNull() {
            assertThat(LogRedactionUtils.redactSupabaseId((UUID) null)).isNull();
        }
    }
}
