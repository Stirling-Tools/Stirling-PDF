package stirling.software.SPDF.model.api.security;

import static org.assertj.core.api.Assertions.*;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.api.security.RedactionArea;

@DisplayName("ManualRedactPdfRequest")
class ManualRedactPdfRequestTest {

    private RedactionArea area(String color) {
        RedactionArea a = new RedactionArea();
        a.setColor(color);
        return a;
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("all accessors round-trip including inherited pageNumbers")
        void roundTrip() {
            ManualRedactPdfRequest req = new ManualRedactPdfRequest();
            List<RedactionArea> areas = List.of(area("#000000"), area("#ffffff"));
            req.setRedactions(areas);
            req.setConvertPDFToImage(true);
            req.setPageRedactionColor("#123456");
            req.setPageNumbers("1,2");

            assertThat(req.getRedactions()).hasSize(2).isEqualTo(areas);
            assertThat(req.getConvertPDFToImage()).isTrue();
            assertThat(req.getPageRedactionColor()).isEqualTo("#123456");
            assertThat(req.getPageNumbers()).isEqualTo("1,2");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class EqualityContract {

        @Test
        @DisplayName("equal pair shares hashCode")
        void equalPair() {
            ManualRedactPdfRequest a = new ManualRedactPdfRequest();
            a.setPageRedactionColor("#000000");
            ManualRedactPdfRequest b = new ManualRedactPdfRequest();
            b.setPageRedactionColor("#000000");

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differs when a subclass field differs")
        void notEqualOnFieldDiff() {
            ManualRedactPdfRequest a = new ManualRedactPdfRequest();
            a.setPageRedactionColor("#000000");
            ManualRedactPdfRequest b = new ManualRedactPdfRequest();
            b.setPageRedactionColor("#ffffff");

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or unrelated type")
        void notEqualToOthers() {
            ManualRedactPdfRequest a = new ManualRedactPdfRequest();
            assertThat(a).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name and a field value")
        void toStringContent() {
            ManualRedactPdfRequest a = new ManualRedactPdfRequest();
            a.setPageRedactionColor("#abcdef");
            assertThat(a.toString()).contains("ManualRedactPdfRequest").contains("#abcdef");
        }
    }
}
