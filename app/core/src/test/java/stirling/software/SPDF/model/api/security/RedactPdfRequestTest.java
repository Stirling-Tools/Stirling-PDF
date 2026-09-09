package stirling.software.SPDF.model.api.security;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("RedactPdfRequest")
class RedactPdfRequestTest {

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("all accessors round-trip")
        void roundTrip() {
            RedactPdfRequest req = new RedactPdfRequest();
            req.setListOfText("foo,bar");
            req.setUseRegex(true);
            req.setWholeWordSearch(false);
            req.setRedactColor("#000000");
            req.setCustomPadding(2.5f);
            req.setConvertPDFToImage(true);

            assertThat(req.getListOfText()).isEqualTo("foo,bar");
            assertThat(req.getUseRegex()).isTrue();
            assertThat(req.getWholeWordSearch()).isFalse();
            assertThat(req.getRedactColor()).isEqualTo("#000000");
            assertThat(req.getCustomPadding()).isEqualTo(2.5f);
            assertThat(req.getConvertPDFToImage()).isTrue();
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class EqualityContract {

        @Test
        @DisplayName("equal pair shares hashCode")
        void equalPair() {
            RedactPdfRequest a = new RedactPdfRequest();
            a.setListOfText("x");
            RedactPdfRequest b = new RedactPdfRequest();
            b.setListOfText("x");

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differs when a subclass field differs")
        void notEqualOnFieldDiff() {
            RedactPdfRequest a = new RedactPdfRequest();
            a.setRedactColor("#000000");
            RedactPdfRequest b = new RedactPdfRequest();
            b.setRedactColor("#ffffff");

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or unrelated type")
        void notEqualToOthers() {
            assertThat(new RedactPdfRequest()).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name and a field value")
        void toStringContent() {
            RedactPdfRequest a = new RedactPdfRequest();
            a.setListOfText("findme");
            assertThat(a.toString()).contains("RedactPdfRequest").contains("findme");
        }
    }
}
