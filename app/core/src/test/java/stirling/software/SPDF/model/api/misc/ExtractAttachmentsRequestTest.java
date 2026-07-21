package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

// Zero-field subclass of PDFFile; exercised through inherited state and equality.
@DisplayName("ExtractAttachmentsRequest")
class ExtractAttachmentsRequestTest {

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            ExtractAttachmentsRequest req = new ExtractAttachmentsRequest();
            req.setFileId("file-55");
            assertThat(req.getFileId()).isEqualTo("file-55");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            ExtractAttachmentsRequest a = new ExtractAttachmentsRequest();
            ExtractAttachmentsRequest b = new ExtractAttachmentsRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when an inherited field differs")
        void differByInheritedField() {
            ExtractAttachmentsRequest a = new ExtractAttachmentsRequest();
            ExtractAttachmentsRequest b = new ExtractAttachmentsRequest();
            b.setFileId("x");
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            ExtractAttachmentsRequest a = new ExtractAttachmentsRequest();
            assertThat(a).isNotEqualTo(null);
            assertThat(a).isNotEqualTo("a string");
        }
    }

    @Nested
    @DisplayName("toString")
    class ToString {

        @Test
        @DisplayName("is non-null")
        void toStringNonNull() {
            assertThat(new ExtractAttachmentsRequest().toString()).isNotNull();
        }
    }
}
