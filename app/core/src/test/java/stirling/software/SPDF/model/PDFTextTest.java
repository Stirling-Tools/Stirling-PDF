package stirling.software.SPDF.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class PDFTextTest {

    private PDFText sample() {
        return new PDFText(1, 10.0f, 20.0f, 30.0f, 40.0f, "hello");
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("all-args constructor exposes immutable values")
        void constructor() {
            PDFText text = sample();

            assertThat(text.getPageIndex()).isEqualTo(1);
            assertThat(text.getX1()).isEqualTo(10.0f);
            assertThat(text.getY1()).isEqualTo(20.0f);
            assertThat(text.getX2()).isEqualTo(30.0f);
            assertThat(text.getY2()).isEqualTo(40.0f);
            assertThat(text.getText()).isEqualTo("hello");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("equal values are equal and share a hashCode")
        void equalValues() {
            assertThat(sample()).isEqualTo(sample()).hasSameHashCodeAs(sample());
        }

        @Test
        @DisplayName("different text breaks equality")
        void differentText() {
            PDFText other = new PDFText(1, 10.0f, 20.0f, 30.0f, 40.0f, "world");

            assertThat(sample()).isNotEqualTo(other).isNotEqualTo(null).isNotEqualTo("x");
        }

        @Test
        @DisplayName("different coordinate breaks equality")
        void differentCoordinate() {
            PDFText other = new PDFText(2, 10.0f, 20.0f, 30.0f, 40.0f, "hello");

            assertThat(sample()).isNotEqualTo(other);
        }

        @Test
        @DisplayName("toString contains text content")
        void toStringContent() {
            assertThat(sample().toString()).contains("hello");
        }
    }
}
