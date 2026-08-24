package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("CertSignController visible appearance lines")
class CertSignAppearanceLinesTest {

    @Test
    @DisplayName("form Name wins over certificate CN")
    void prefersFormName() {
        assertThat(CertSignController.resolveDisplaySignerName("Alice", "CN From Cert"))
                .isEqualTo("Alice");
        assertThat(CertSignController.resolveDisplaySignerName("  ", "CN From Cert"))
                .isEqualTo("CN From Cert");
        assertThat(CertSignController.resolveDisplaySignerName(null, null)).isEqualTo("Unknown");
    }

    @Test
    @DisplayName("includes reason and location when present")
    void includesReasonAndLocation() {
        List<String> lines =
                CertSignController.buildVisibleAppearanceLines(
                        "Alice", "Mon Jul 17 12:00:00 UTC 2026", "Approved", "Berlin");

        assertThat(lines)
                .containsExactly(
                        "Signed by Alice", "Mon Jul 17 12:00:00 UTC 2026", "Approved", "Berlin");
    }

    @Test
    @DisplayName("omits blank reason and location")
    void omitsBlankOptionalLines() {
        List<String> lines =
                CertSignController.buildVisibleAppearanceLines("Bob", "date", "  ", null);

        assertThat(lines).containsExactly("Signed by Bob", "date");
    }

    @Test
    @DisplayName("font size shrinks for narrow boxes but stays at minimum")
    void fontSizeHasFloor() throws IOException {
        var font = new PDType1Font(FontName.TIMES_BOLD);
        List<String> lines =
                List.of(
                        "Signed by A Very Long Certificate Common Name Indeed",
                        "Mon Jul 17 12:00:00 UTC 2026",
                        "A rather long approval reason that needs room",
                        "Somewhere far away");

        float wide = CertSignController.fitAppearanceFontSize(lines, font, 400f, 80f);
        float narrow = CertSignController.fitAppearanceFontSize(lines, font, 40f, 80f);

        assertThat(wide).isGreaterThan(narrow);
        assertThat(narrow).isEqualTo(6f);
    }
}
