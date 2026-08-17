package stirling.software.SPDF.model.api.signature;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("SavedSignatureResponse")
class SavedSignatureResponseTest {

    @Nested
    @DisplayName("constructors")
    class Constructors {

        @Test
        @DisplayName("no-arg constructor yields null fields")
        void noArg() {
            SavedSignatureResponse r = new SavedSignatureResponse();
            assertThat(r.getId()).isNull();
            assertThat(r.getCreatedAt()).isNull();
            assertThat(r.getUpdatedAt()).isNull();
        }

        @Test
        @DisplayName("all-args constructor sets every field")
        void allArgs() {
            SavedSignatureResponse r =
                    new SavedSignatureResponse(
                            "id-1",
                            "label",
                            "canvas",
                            "shared",
                            "data:url",
                            "Bob",
                            "Arial",
                            16,
                            "#ffffff",
                            100L,
                            200L);

            assertThat(r.getId()).isEqualTo("id-1");
            assertThat(r.getLabel()).isEqualTo("label");
            assertThat(r.getType()).isEqualTo("canvas");
            assertThat(r.getScope()).isEqualTo("shared");
            assertThat(r.getDataUrl()).isEqualTo("data:url");
            assertThat(r.getSignerName()).isEqualTo("Bob");
            assertThat(r.getFontFamily()).isEqualTo("Arial");
            assertThat(r.getFontSize()).isEqualTo(16);
            assertThat(r.getTextColor()).isEqualTo("#ffffff");
            assertThat(r.getCreatedAt()).isEqualTo(100L);
            assertThat(r.getUpdatedAt()).isEqualTo(200L);
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("all accessors round-trip")
        void roundTrip() {
            SavedSignatureResponse r = new SavedSignatureResponse();
            r.setId("id-2");
            r.setLabel("label2");
            r.setType("image");
            r.setScope("personal");
            r.setDataUrl("http://img");
            r.setSignerName("Carol");
            r.setFontFamily("Times");
            r.setFontSize(12);
            r.setTextColor("#123456");
            r.setCreatedAt(1L);
            r.setUpdatedAt(2L);

            assertThat(r.getId()).isEqualTo("id-2");
            assertThat(r.getLabel()).isEqualTo("label2");
            assertThat(r.getType()).isEqualTo("image");
            assertThat(r.getScope()).isEqualTo("personal");
            assertThat(r.getDataUrl()).isEqualTo("http://img");
            assertThat(r.getSignerName()).isEqualTo("Carol");
            assertThat(r.getFontFamily()).isEqualTo("Times");
            assertThat(r.getFontSize()).isEqualTo(12);
            assertThat(r.getTextColor()).isEqualTo("#123456");
            assertThat(r.getCreatedAt()).isEqualTo(1L);
            assertThat(r.getUpdatedAt()).isEqualTo(2L);
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class EqualityContract {

        @Test
        @DisplayName("equal pair shares hashCode")
        void equalPair() {
            SavedSignatureResponse a = new SavedSignatureResponse();
            a.setId("x");
            SavedSignatureResponse b = new SavedSignatureResponse();
            b.setId("x");

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differs when a field differs")
        void notEqualOnFieldDiff() {
            SavedSignatureResponse a = new SavedSignatureResponse();
            a.setCreatedAt(1L);
            SavedSignatureResponse b = new SavedSignatureResponse();
            b.setCreatedAt(2L);

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or unrelated type")
        void notEqualToOthers() {
            assertThat(new SavedSignatureResponse()).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name and a field value")
        void toStringContent() {
            SavedSignatureResponse a = new SavedSignatureResponse();
            a.setLabel("respLabel");
            assertThat(a.toString()).contains("SavedSignatureResponse").contains("respLabel");
        }
    }
}
