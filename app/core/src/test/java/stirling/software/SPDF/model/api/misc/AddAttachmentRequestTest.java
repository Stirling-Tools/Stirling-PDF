package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("AddAttachmentRequest")
class AddAttachmentRequestTest {

    private static MultipartFile sampleFile(String name) {
        return new MockMultipartFile(name, name, "application/octet-stream", new byte[] {1, 2, 3});
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("convertToPdfA3b defaults to false")
        void convertToPdfA3bDefaultsFalse() {
            assertThat(new AddAttachmentRequest().isConvertToPdfA3b()).isFalse();
        }

        @Test
        @DisplayName("attachments defaults to null")
        void attachmentsDefaultsNull() {
            assertThat(new AddAttachmentRequest().getAttachments()).isNull();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("attachments round-trips")
        void attachmentsRoundTrip() {
            AddAttachmentRequest req = new AddAttachmentRequest();
            List<MultipartFile> files = List.of(sampleFile("a.png"), sampleFile("b.png"));
            req.setAttachments(files);
            assertThat(req.getAttachments()).isEqualTo(files).hasSize(2);
        }

        @Test
        @DisplayName("convertToPdfA3b round-trips")
        void convertToPdfA3bRoundTrip() {
            AddAttachmentRequest req = new AddAttachmentRequest();
            req.setConvertToPdfA3b(true);
            assertThat(req.isConvertToPdfA3b()).isTrue();
        }

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            AddAttachmentRequest req = new AddAttachmentRequest();
            req.setFileId("file-123");
            assertThat(req.getFileId()).isEqualTo("file-123");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            AddAttachmentRequest a = new AddAttachmentRequest();
            AddAttachmentRequest b = new AddAttachmentRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when a subclass field differs")
        void differBySubclassField() {
            AddAttachmentRequest a = new AddAttachmentRequest();
            AddAttachmentRequest b = new AddAttachmentRequest();
            b.setConvertToPdfA3b(true);
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("differ when an inherited field differs")
        void differByInheritedField() {
            AddAttachmentRequest a = new AddAttachmentRequest();
            AddAttachmentRequest b = new AddAttachmentRequest();
            b.setFileId("x");
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            AddAttachmentRequest a = new AddAttachmentRequest();
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
            AddAttachmentRequest req = new AddAttachmentRequest();
            req.setConvertToPdfA3b(true);
            assertThat(req.toString()).isNotNull().contains("convertToPdfA3b=true");
        }
    }
}
