package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

// Zero-field subclass of PDFFile; exercised through inherited state and equality.
@DisplayName("ListAttachmentsRequest")
class ListAttachmentsRequestTest {

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            ListAttachmentsRequest req = new ListAttachmentsRequest();
            req.setFileId("file-66");
            assertThat(req.getFileId()).isEqualTo("file-66");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            ListAttachmentsRequest a = new ListAttachmentsRequest();
            ListAttachmentsRequest b = new ListAttachmentsRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when an inherited field differs")
        void differByInheritedField() {
            ListAttachmentsRequest a = new ListAttachmentsRequest();
            ListAttachmentsRequest b = new ListAttachmentsRequest();
            b.setFileId("x");
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            ListAttachmentsRequest a = new ListAttachmentsRequest();
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
            assertThat(new ListAttachmentsRequest().toString()).isNotNull();
        }
    }
}
