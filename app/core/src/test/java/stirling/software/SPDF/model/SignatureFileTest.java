package stirling.software.SPDF.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class SignatureFileTest {

    @Nested
    @DisplayName("constructors")
    class Constructors {

        @Test
        @DisplayName("all-args constructor sets both fields")
        void allArgs() {
            SignatureFile file = new SignatureFile("sig.png", "Personal");

            assertThat(file.getFileName()).isEqualTo("sig.png");
            assertThat(file.getCategory()).isEqualTo("Personal");
        }

        @Test
        @DisplayName("no-arg constructor leaves fields null")
        void noArgs() {
            SignatureFile file = new SignatureFile();

            assertThat(file.getFileName()).isNull();
            assertThat(file.getCategory()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters update fields")
        void setters() {
            SignatureFile file = new SignatureFile();
            file.setFileName("shared.png");
            file.setCategory("Shared");

            assertThat(file.getFileName()).isEqualTo("shared.png");
            assertThat(file.getCategory()).isEqualTo("Shared");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("equal content is equal and shares hashCode")
        void equalContent() {
            SignatureFile a = new SignatureFile("sig.png", "Personal");
            SignatureFile b = new SignatureFile("sig.png", "Personal");

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing category breaks equality")
        void differing() {
            SignatureFile a = new SignatureFile("sig.png", "Personal");
            SignatureFile b = new SignatureFile("sig.png", "Shared");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("x");
        }

        @Test
        @DisplayName("toString contains both fields")
        void toStringContent() {
            assertThat(new SignatureFile("sig.png", "Personal").toString())
                    .contains("sig.png")
                    .contains("Personal");
        }
    }
}
