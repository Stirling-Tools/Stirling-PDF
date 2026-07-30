package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("RenameAttachmentRequest")
class RenameAttachmentRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("attachmentName and newName default to null")
        void defaultsNull() {
            RenameAttachmentRequest req = new RenameAttachmentRequest();
            assertThat(req.getAttachmentName()).isNull();
            assertThat(req.getNewName()).isNull();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("all fields round-trip")
        void allFieldsRoundTrip() {
            RenameAttachmentRequest req = new RenameAttachmentRequest();
            req.setAttachmentName("old.txt");
            req.setNewName("new.txt");
            assertThat(req.getAttachmentName()).isEqualTo("old.txt");
            assertThat(req.getNewName()).isEqualTo("new.txt");
        }

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            RenameAttachmentRequest req = new RenameAttachmentRequest();
            req.setFileId("file-10");
            assertThat(req.getFileId()).isEqualTo("file-10");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            RenameAttachmentRequest a = new RenameAttachmentRequest();
            RenameAttachmentRequest b = new RenameAttachmentRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when a subclass field differs")
        void differBySubclassField() {
            RenameAttachmentRequest a = new RenameAttachmentRequest();
            RenameAttachmentRequest b = new RenameAttachmentRequest();
            b.setNewName("changed.txt");
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            RenameAttachmentRequest a = new RenameAttachmentRequest();
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
            RenameAttachmentRequest req = new RenameAttachmentRequest();
            req.setNewName("renamed.txt");
            assertThat(req.toString()).isNotNull().contains("newName=renamed.txt");
        }
    }
}
