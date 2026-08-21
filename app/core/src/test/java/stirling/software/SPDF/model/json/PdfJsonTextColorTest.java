package stirling.software.SPDF.model.json;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("PdfJsonTextColor")
class PdfJsonTextColorTest {

    @Test
    @DisplayName("no-arg constructor yields null fields")
    void noArg() {
        PdfJsonTextColor c = new PdfJsonTextColor();
        assertThat(c.getColorSpace()).isNull();
        assertThat(c.getComponents()).isNull();
    }

    @Test
    @DisplayName("all-args constructor and accessors round-trip")
    void allArgs() {
        float[] comps = {0.1f, 0.2f, 0.3f};
        PdfJsonTextColor c = new PdfJsonTextColor("DeviceRGB", comps);
        assertThat(c.getColorSpace()).isEqualTo("DeviceRGB");
        assertThat(c.getComponents()).containsExactly(0.1f, 0.2f, 0.3f);
    }

    @Test
    @DisplayName("builder and setters round-trip")
    void builderAndSetters() {
        PdfJsonTextColor c =
                PdfJsonTextColor.builder()
                        .colorSpace("DeviceGray")
                        .components(new float[] {0.5f})
                        .build();
        assertThat(c.getColorSpace()).isEqualTo("DeviceGray");
        assertThat(c.getComponents()).containsExactly(0.5f);

        c.setColorSpace("DeviceCMYK");
        assertThat(c.getColorSpace()).isEqualTo("DeviceCMYK");
    }

    // Lombok deep-compares float[] via Arrays.equals.
    @Test
    @DisplayName("equal content arrays equal; different content not")
    void arrayEquality() {
        PdfJsonTextColor a =
                PdfJsonTextColor.builder()
                        .colorSpace("RGB")
                        .components(new float[] {1f, 2f})
                        .build();
        PdfJsonTextColor b =
                PdfJsonTextColor.builder()
                        .colorSpace("RGB")
                        .components(new float[] {1f, 2f})
                        .build();
        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

        PdfJsonTextColor c =
                PdfJsonTextColor.builder().colorSpace("RGB").components(new float[] {9f}).build();
        assertThat(a).isNotEqualTo(c).isNotEqualTo(null).isNotEqualTo("string");
        assertThat(a.toString()).contains("PdfJsonTextColor");
    }
}
