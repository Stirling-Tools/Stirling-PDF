package stirling.software.SPDF.model.json;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("PdfJsonPageDimension")
class PdfJsonPageDimensionTest {

    @Test
    @DisplayName("no-arg constructor yields primitive defaults")
    void noArg() {
        PdfJsonPageDimension d = new PdfJsonPageDimension();
        assertThat(d.getPageNumber()).isZero();
        assertThat(d.getWidth()).isZero();
        assertThat(d.getHeight()).isZero();
        assertThat(d.getRotation()).isZero();
    }

    @Test
    @DisplayName("all-args constructor sets every field")
    void allArgs() {
        PdfJsonPageDimension d = new PdfJsonPageDimension(1, 612f, 792f, 90);
        assertThat(d.getPageNumber()).isEqualTo(1);
        assertThat(d.getWidth()).isEqualTo(612f);
        assertThat(d.getHeight()).isEqualTo(792f);
        assertThat(d.getRotation()).isEqualTo(90);
    }

    @Test
    @DisplayName("builder and setters round-trip")
    void builderAndSetters() {
        PdfJsonPageDimension d =
                PdfJsonPageDimension.builder()
                        .pageNumber(2)
                        .width(100f)
                        .height(200f)
                        .rotation(180)
                        .build();
        assertThat(d.getPageNumber()).isEqualTo(2);
        assertThat(d.getWidth()).isEqualTo(100f);
        assertThat(d.getHeight()).isEqualTo(200f);
        assertThat(d.getRotation()).isEqualTo(180);

        d.setWidth(300f);
        assertThat(d.getWidth()).isEqualTo(300f);
    }

    @Test
    @DisplayName("equals/hashCode/toString")
    void equality() {
        PdfJsonPageDimension a = new PdfJsonPageDimension(1, 10f, 20f, 0);
        PdfJsonPageDimension b = new PdfJsonPageDimension(1, 10f, 20f, 0);
        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

        PdfJsonPageDimension c = new PdfJsonPageDimension(2, 10f, 20f, 0);
        assertThat(a).isNotEqualTo(c).isNotEqualTo(null).isNotEqualTo("string");
        assertThat(a.toString()).contains("PdfJsonPageDimension");
    }
}
