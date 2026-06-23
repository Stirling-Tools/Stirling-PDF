package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("AttachmentInfo")
class AttachmentInfoTest {

    @Nested
    @DisplayName("constructors")
    class Constructors {

        @Test
        @DisplayName("no-arg constructor leaves all fields null")
        void noArgConstructorNullFields() {
            AttachmentInfo info = new AttachmentInfo();
            assertThat(info.getFilename()).isNull();
            assertThat(info.getSize()).isNull();
            assertThat(info.getContentType()).isNull();
            assertThat(info.getDescription()).isNull();
            assertThat(info.getCreationDate()).isNull();
            assertThat(info.getModificationDate()).isNull();
        }

        @Test
        @DisplayName("all-args constructor sets every field")
        void allArgsConstructorSetsFields() {
            AttachmentInfo info =
                    new AttachmentInfo("file.txt", 123L, "text/plain", "desc", "2023", "2024");
            assertThat(info.getFilename()).isEqualTo("file.txt");
            assertThat(info.getSize()).isEqualTo(123L);
            assertThat(info.getContentType()).isEqualTo("text/plain");
            assertThat(info.getDescription()).isEqualTo("desc");
            assertThat(info.getCreationDate()).isEqualTo("2023");
            assertThat(info.getModificationDate()).isEqualTo("2024");
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("all fields round-trip")
        void allFieldsRoundTrip() {
            AttachmentInfo info = new AttachmentInfo();
            info.setFilename("a.pdf");
            info.setSize(42L);
            info.setContentType("application/pdf");
            info.setDescription("an attachment");
            info.setCreationDate("2023/10/01");
            info.setModificationDate("2024/01/02");

            assertThat(info.getFilename()).isEqualTo("a.pdf");
            assertThat(info.getSize()).isEqualTo(42L);
            assertThat(info.getContentType()).isEqualTo("application/pdf");
            assertThat(info.getDescription()).isEqualTo("an attachment");
            assertThat(info.getCreationDate()).isEqualTo("2023/10/01");
            assertThat(info.getModificationDate()).isEqualTo("2024/01/02");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("equal objects are equal and share hashCode")
        void equalObjects() {
            AttachmentInfo a = new AttachmentInfo("f", 1L, "ct", "d", "c", "m");
            AttachmentInfo b = new AttachmentInfo("f", 1L, "ct", "d", "c", "m");
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when one field differs")
        void differByOneField() {
            AttachmentInfo a = new AttachmentInfo("f", 1L, "ct", "d", "c", "m");
            AttachmentInfo b = new AttachmentInfo("f", 2L, "ct", "d", "c", "m");
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            AttachmentInfo a = new AttachmentInfo();
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
            AttachmentInfo info = new AttachmentInfo();
            info.setFilename("report.pdf");
            assertThat(info.toString()).isNotNull().contains("report.pdf");
        }
    }
}
