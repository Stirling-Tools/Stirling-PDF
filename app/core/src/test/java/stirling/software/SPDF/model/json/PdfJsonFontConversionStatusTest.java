package stirling.software.SPDF.model.json;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class PdfJsonFontConversionStatusTest {

    @Test
    @DisplayName("contains exactly the expected constants")
    void containsExpected() {
        assertThat(Arrays.stream(PdfJsonFontConversionStatus.values()).map(Enum::name))
                .containsExactlyInAnyOrder(
                        "SUCCESS", "WARNING", "FAILURE", "SKIPPED", "UNSUPPORTED");
    }

    @ParameterizedTest
    @EnumSource(PdfJsonFontConversionStatus.class)
    @DisplayName("valueOf round trips every constant")
    void valueOfRoundTrip(PdfJsonFontConversionStatus status) {
        assertThat(PdfJsonFontConversionStatus.valueOf(status.name())).isSameAs(status);
    }

    @Test
    @DisplayName("valueOf throws for unknown name")
    void valueOfUnknownThrows() {
        assertThatThrownBy(() -> PdfJsonFontConversionStatus.valueOf("BROKEN"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
