package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("AddPageNumbersRequest")
class AddPageNumbersRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("documented default field values on a fresh instance")
        void documentedDefaults() {
            AddPageNumbersRequest req = new AddPageNumbersRequest();
            assertThat(req.getZeroPad()).isZero();
            assertThat(req.getPosition()).isEqualTo(8);
            assertThat(req.getStartingNumber()).isZero();
            assertThat(req.getFontSize()).isEqualTo(0f);
            assertThat(req.getCustomMargin()).isNull();
            assertThat(req.getFontType()).isNull();
            assertThat(req.getFontColor()).isNull();
            assertThat(req.getPagesToNumber()).isNull();
            assertThat(req.getCustomText()).isNull();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("all fields round-trip")
        void allFieldsRoundTrip() {
            AddPageNumbersRequest req = new AddPageNumbersRequest();
            req.setCustomMargin("large");
            req.setFontSize(14.5f);
            req.setFontType("courier");
            req.setFontColor("#FF0000");
            req.setZeroPad(4);
            req.setPosition(5);
            req.setStartingNumber(2);
            req.setPagesToNumber("1,3-5");
            req.setCustomText("Page {n} of {total}");

            assertThat(req.getCustomMargin()).isEqualTo("large");
            assertThat(req.getFontSize()).isEqualTo(14.5f);
            assertThat(req.getFontType()).isEqualTo("courier");
            assertThat(req.getFontColor()).isEqualTo("#FF0000");
            assertThat(req.getZeroPad()).isEqualTo(4);
            assertThat(req.getPosition()).isEqualTo(5);
            assertThat(req.getStartingNumber()).isEqualTo(2);
            assertThat(req.getPagesToNumber()).isEqualTo("1,3-5");
            assertThat(req.getCustomText()).isEqualTo("Page {n} of {total}");
        }

        @Test
        @DisplayName("inherited pageNumbers round-trips")
        void inheritedPageNumbersRoundTrip() {
            AddPageNumbersRequest req = new AddPageNumbersRequest();
            req.setPageNumbers("2n+1");
            assertThat(req.getPageNumbers()).isEqualTo("2n+1");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            AddPageNumbersRequest a = new AddPageNumbersRequest();
            AddPageNumbersRequest b = new AddPageNumbersRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when a subclass field differs")
        void differBySubclassField() {
            AddPageNumbersRequest a = new AddPageNumbersRequest();
            AddPageNumbersRequest b = new AddPageNumbersRequest();
            b.setFontType("times");
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("differ when an inherited field differs")
        void differByInheritedField() {
            AddPageNumbersRequest a = new AddPageNumbersRequest();
            AddPageNumbersRequest b = new AddPageNumbersRequest();
            b.setPageNumbers("all");
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            AddPageNumbersRequest a = new AddPageNumbersRequest();
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
            AddPageNumbersRequest req = new AddPageNumbersRequest();
            req.setFontType("helvetica");
            assertThat(req.toString()).isNotNull().contains("fontType=helvetica");
        }
    }
}
