package stirling.software.SPDF.model.json;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("PdfJsonFontCidSystemInfo")
class PdfJsonFontCidSystemInfoTest {

    @Test
    @DisplayName("no-arg constructor yields null fields")
    void noArg() {
        PdfJsonFontCidSystemInfo info = new PdfJsonFontCidSystemInfo();
        assertThat(info.getRegistry()).isNull();
        assertThat(info.getOrdering()).isNull();
        assertThat(info.getSupplement()).isNull();
    }

    @Test
    @DisplayName("all-args constructor sets every field")
    void allArgs() {
        PdfJsonFontCidSystemInfo info = new PdfJsonFontCidSystemInfo("Adobe", "Japan1", 6);
        assertThat(info.getRegistry()).isEqualTo("Adobe");
        assertThat(info.getOrdering()).isEqualTo("Japan1");
        assertThat(info.getSupplement()).isEqualTo(6);
    }

    @Test
    @DisplayName("builder and setters round-trip")
    void builderAndSetters() {
        PdfJsonFontCidSystemInfo info =
                PdfJsonFontCidSystemInfo.builder()
                        .registry("Adobe")
                        .ordering("Identity")
                        .supplement(0)
                        .build();
        assertThat(info.getRegistry()).isEqualTo("Adobe");
        assertThat(info.getOrdering()).isEqualTo("Identity");
        assertThat(info.getSupplement()).isZero();

        info.setSupplement(2);
        assertThat(info.getSupplement()).isEqualTo(2);
    }

    @Test
    @DisplayName("equals/hashCode/toString")
    void equality() {
        PdfJsonFontCidSystemInfo a = PdfJsonFontCidSystemInfo.builder().registry("Adobe").build();
        PdfJsonFontCidSystemInfo b = PdfJsonFontCidSystemInfo.builder().registry("Adobe").build();
        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

        PdfJsonFontCidSystemInfo c = PdfJsonFontCidSystemInfo.builder().registry("MS").build();
        assertThat(a).isNotEqualTo(c).isNotEqualTo(null).isNotEqualTo("string");
        assertThat(a.toString()).contains("PdfJsonFontCidSystemInfo").contains("Adobe");
    }
}
