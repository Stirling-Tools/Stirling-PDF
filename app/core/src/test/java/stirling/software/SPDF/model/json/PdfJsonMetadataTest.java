package stirling.software.SPDF.model.json;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("PdfJsonMetadata")
class PdfJsonMetadataTest {

    @Nested
    @DisplayName("constructors and builder")
    class Construction {

        @Test
        @DisplayName("no-arg constructor yields null fields")
        void noArg() {
            PdfJsonMetadata m = new PdfJsonMetadata();
            assertThat(m.getTitle()).isNull();
            assertThat(m.getNumberOfPages()).isNull();
        }

        @Test
        @DisplayName("all-args constructor sets every field")
        void allArgs() {
            PdfJsonMetadata m =
                    new PdfJsonMetadata(
                            "Title",
                            "Author",
                            "Subject",
                            "kw",
                            "Creator",
                            "Producer",
                            "2025-01-01",
                            "2026-01-01",
                            "False",
                            7);

            assertThat(m.getTitle()).isEqualTo("Title");
            assertThat(m.getAuthor()).isEqualTo("Author");
            assertThat(m.getSubject()).isEqualTo("Subject");
            assertThat(m.getKeywords()).isEqualTo("kw");
            assertThat(m.getCreator()).isEqualTo("Creator");
            assertThat(m.getProducer()).isEqualTo("Producer");
            assertThat(m.getCreationDate()).isEqualTo("2025-01-01");
            assertThat(m.getModificationDate()).isEqualTo("2026-01-01");
            assertThat(m.getTrapped()).isEqualTo("False");
            assertThat(m.getNumberOfPages()).isEqualTo(7);
        }

        @Test
        @DisplayName("builder sets fields")
        void builder() {
            PdfJsonMetadata m =
                    PdfJsonMetadata.builder()
                            .title("BuiltTitle")
                            .author("BuiltAuthor")
                            .numberOfPages(3)
                            .build();

            assertThat(m.getTitle()).isEqualTo("BuiltTitle");
            assertThat(m.getAuthor()).isEqualTo("BuiltAuthor");
            assertThat(m.getNumberOfPages()).isEqualTo(3);
        }
    }

    @Nested
    @DisplayName("accessors and equality")
    class Behavior {

        @Test
        @DisplayName("setters round-trip")
        void roundTrip() {
            PdfJsonMetadata m = new PdfJsonMetadata();
            m.setTitle("T");
            m.setNumberOfPages(2);
            assertThat(m.getTitle()).isEqualTo("T");
            assertThat(m.getNumberOfPages()).isEqualTo(2);
        }

        @Test
        @DisplayName("equal pair shares hashCode; differs by field")
        void equality() {
            PdfJsonMetadata a = PdfJsonMetadata.builder().title("X").build();
            PdfJsonMetadata b = PdfJsonMetadata.builder().title("X").build();
            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

            PdfJsonMetadata c = PdfJsonMetadata.builder().title("Y").build();
            assertThat(a).isNotEqualTo(c).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name and value")
        void toStringContent() {
            PdfJsonMetadata m = PdfJsonMetadata.builder().title("Meta").build();
            assertThat(m.toString()).contains("PdfJsonMetadata").contains("Meta");
        }
    }
}
