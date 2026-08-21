package stirling.software.SPDF.model.api.signature;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("SavedSignatureRequest")
class SavedSignatureRequestTest {

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("all accessors round-trip")
        void roundTrip() {
            SavedSignatureRequest req = new SavedSignatureRequest();
            req.setId("id-1");
            req.setLabel("My signature");
            req.setType("text");
            req.setScope("personal");
            req.setDataUrl("data:image/png;base64,AAA");
            req.setSignerName("Alice");
            req.setFontFamily("Helvetica");
            req.setFontSize(14);
            req.setTextColor("#000000");

            assertThat(req.getId()).isEqualTo("id-1");
            assertThat(req.getLabel()).isEqualTo("My signature");
            assertThat(req.getType()).isEqualTo("text");
            assertThat(req.getScope()).isEqualTo("personal");
            assertThat(req.getDataUrl()).isEqualTo("data:image/png;base64,AAA");
            assertThat(req.getSignerName()).isEqualTo("Alice");
            assertThat(req.getFontFamily()).isEqualTo("Helvetica");
            assertThat(req.getFontSize()).isEqualTo(14);
            assertThat(req.getTextColor()).isEqualTo("#000000");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class EqualityContract {

        @Test
        @DisplayName("equal pair shares hashCode")
        void equalPair() {
            SavedSignatureRequest a = new SavedSignatureRequest();
            a.setId("x");
            SavedSignatureRequest b = new SavedSignatureRequest();
            b.setId("x");

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differs when a field differs")
        void notEqualOnFieldDiff() {
            SavedSignatureRequest a = new SavedSignatureRequest();
            a.setId("x");
            SavedSignatureRequest b = new SavedSignatureRequest();
            b.setId("y");

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or unrelated type")
        void notEqualToOthers() {
            assertThat(new SavedSignatureRequest()).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name and a field value")
        void toStringContent() {
            SavedSignatureRequest a = new SavedSignatureRequest();
            a.setLabel("sigLabel");
            assertThat(a.toString()).contains("SavedSignatureRequest").contains("sigLabel");
        }
    }
}
