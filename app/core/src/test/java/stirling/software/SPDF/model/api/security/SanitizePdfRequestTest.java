package stirling.software.SPDF.model.api.security;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("SanitizePdfRequest")
class SanitizePdfRequestTest {

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("all boolean accessors round-trip")
        void roundTrip() {
            SanitizePdfRequest req = new SanitizePdfRequest();
            req.setRemoveJavaScript(true);
            req.setRemoveEmbeddedFiles(false);
            req.setRemoveXMPMetadata(true);
            req.setRemoveMetadata(false);
            req.setRemoveLinks(true);
            req.setRemoveFonts(false);

            assertThat(req.getRemoveJavaScript()).isTrue();
            assertThat(req.getRemoveEmbeddedFiles()).isFalse();
            assertThat(req.getRemoveXMPMetadata()).isTrue();
            assertThat(req.getRemoveMetadata()).isFalse();
            assertThat(req.getRemoveLinks()).isTrue();
            assertThat(req.getRemoveFonts()).isFalse();
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class EqualityContract {

        @Test
        @DisplayName("equal pair shares hashCode")
        void equalPair() {
            SanitizePdfRequest a = new SanitizePdfRequest();
            a.setRemoveJavaScript(true);
            SanitizePdfRequest b = new SanitizePdfRequest();
            b.setRemoveJavaScript(true);

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differs when a subclass field differs")
        void notEqualOnFieldDiff() {
            SanitizePdfRequest a = new SanitizePdfRequest();
            a.setRemoveFonts(true);
            SanitizePdfRequest b = new SanitizePdfRequest();
            b.setRemoveFonts(false);

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or unrelated type")
        void notEqualToOthers() {
            assertThat(new SanitizePdfRequest()).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name")
        void toStringContent() {
            assertThat(new SanitizePdfRequest().toString()).contains("SanitizePdfRequest");
        }
    }
}
