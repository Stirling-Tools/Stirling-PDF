package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("DeleteAttachmentRequest")
class DeleteAttachmentRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("attachmentName defaults to null")
        void attachmentNameDefaultsNull() {
            assertThat(new DeleteAttachmentRequest().getAttachmentName()).isNull();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("attachmentName round-trips")
        void attachmentNameRoundTrip() {
            DeleteAttachmentRequest req = new DeleteAttachmentRequest();
            req.setAttachmentName("notes.txt");
            assertThat(req.getAttachmentName()).isEqualTo("notes.txt");
        }

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            DeleteAttachmentRequest req = new DeleteAttachmentRequest();
            req.setFileId("file-1");
            assertThat(req.getFileId()).isEqualTo("file-1");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            DeleteAttachmentRequest a = new DeleteAttachmentRequest();
            DeleteAttachmentRequest b = new DeleteAttachmentRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when attachmentName differs")
        void differByAttachmentName() {
            DeleteAttachmentRequest a = new DeleteAttachmentRequest();
            DeleteAttachmentRequest b = new DeleteAttachmentRequest();
            b.setAttachmentName("x.txt");
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            DeleteAttachmentRequest a = new DeleteAttachmentRequest();
            assertThat(a).isNotEqualTo(null);
            assertThat(a).isNotEqualTo("a string");
        }
    }

    @Nested
    @DisplayName("toString")
    class ToString {

        @Test
        @DisplayName("is non-null and contains a field value")
        void toStringContainsField() {
            DeleteAttachmentRequest req = new DeleteAttachmentRequest();
            req.setAttachmentName("doc.txt");
            assertThat(req.toString()).isNotNull().contains("attachmentName=doc.txt");
        }
    }
}
