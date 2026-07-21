package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.api.misc.HighContrastColorCombination;
import stirling.software.common.model.api.misc.ReplaceAndInvert;

@DisplayName("ReplaceAndInvertColorRequest")
class ReplaceAndInvertColorRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("all fields default to null on a fresh instance")
        void defaultsNull() {
            ReplaceAndInvertColorRequest req = new ReplaceAndInvertColorRequest();
            assertThat(req.getReplaceAndInvertOption()).isNull();
            assertThat(req.getHighContrastColorCombination()).isNull();
            assertThat(req.getBackGroundColor()).isNull();
            assertThat(req.getTextColor()).isNull();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("all fields round-trip")
        void allFieldsRoundTrip() {
            ReplaceAndInvertColorRequest req = new ReplaceAndInvertColorRequest();
            req.setReplaceAndInvertOption(ReplaceAndInvert.CUSTOM_COLOR);
            req.setHighContrastColorCombination(HighContrastColorCombination.WHITE_TEXT_ON_BLACK);
            req.setBackGroundColor("16777215");
            req.setTextColor("0");

            assertThat(req.getReplaceAndInvertOption()).isEqualTo(ReplaceAndInvert.CUSTOM_COLOR);
            assertThat(req.getHighContrastColorCombination())
                    .isEqualTo(HighContrastColorCombination.WHITE_TEXT_ON_BLACK);
            assertThat(req.getBackGroundColor()).isEqualTo("16777215");
            assertThat(req.getTextColor()).isEqualTo("0");
        }

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            ReplaceAndInvertColorRequest req = new ReplaceAndInvertColorRequest();
            req.setFileId("file-11");
            assertThat(req.getFileId()).isEqualTo("file-11");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            ReplaceAndInvertColorRequest a = new ReplaceAndInvertColorRequest();
            ReplaceAndInvertColorRequest b = new ReplaceAndInvertColorRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when a subclass field differs")
        void differBySubclassField() {
            ReplaceAndInvertColorRequest a = new ReplaceAndInvertColorRequest();
            ReplaceAndInvertColorRequest b = new ReplaceAndInvertColorRequest();
            b.setReplaceAndInvertOption(ReplaceAndInvert.FULL_INVERSION);
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            ReplaceAndInvertColorRequest a = new ReplaceAndInvertColorRequest();
            assertThat(a).isNotEqualTo(null);
            assertThat(a).isNotEqualTo("a string");
        }
    }

    @Nested
    @DisplayName("toString")
    class ToString {

        @Test
        @DisplayName("is non-null and contains a field value")
        void toStringContainsField() {
            ReplaceAndInvertColorRequest req = new ReplaceAndInvertColorRequest();
            req.setReplaceAndInvertOption(ReplaceAndInvert.FULL_INVERSION);
            assertThat(req.toString())
                    .isNotNull()
                    .contains("replaceAndInvertOption=FULL_INVERSION");
        }
    }

    @Nested
    @DisplayName("ReplaceAndInvert enum")
    class ReplaceAndInvertEnum {

        @Test
        @DisplayName("values() exposes all four constants")
        void valuesExposesAll() {
            assertThat(ReplaceAndInvert.values())
                    .containsExactly(
                            ReplaceAndInvert.HIGH_CONTRAST_COLOR,
                            ReplaceAndInvert.CUSTOM_COLOR,
                            ReplaceAndInvert.FULL_INVERSION,
                            ReplaceAndInvert.COLOR_SPACE_CONVERSION);
        }

        @Test
        @DisplayName("valueOf round-trips each constant")
        void valueOfRoundTrip() {
            for (ReplaceAndInvert v : ReplaceAndInvert.values()) {
                assertThat(ReplaceAndInvert.valueOf(v.name())).isSameAs(v);
            }
        }
    }

    @Nested
    @DisplayName("HighContrastColorCombination enum")
    class HighContrastColorCombinationEnum {

        @Test
        @DisplayName("values() exposes all four constants")
        void valuesExposesAll() {
            assertThat(HighContrastColorCombination.values())
                    .containsExactly(
                            HighContrastColorCombination.WHITE_TEXT_ON_BLACK,
                            HighContrastColorCombination.BLACK_TEXT_ON_WHITE,
                            HighContrastColorCombination.YELLOW_TEXT_ON_BLACK,
                            HighContrastColorCombination.GREEN_TEXT_ON_BLACK);
        }

        @Test
        @DisplayName("valueOf round-trips each constant")
        void valueOfRoundTrip() {
            for (HighContrastColorCombination v : HighContrastColorCombination.values()) {
                assertThat(HighContrastColorCombination.valueOf(v.name())).isSameAs(v);
            }
        }
    }
}
