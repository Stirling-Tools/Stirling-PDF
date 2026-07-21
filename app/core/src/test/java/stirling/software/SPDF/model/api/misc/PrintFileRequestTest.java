package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("PrintFileRequest")
class PrintFileRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("printerName defaults to null")
        void printerNameDefaultsNull() {
            assertThat(new PrintFileRequest().getPrinterName()).isNull();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("printerName round-trips")
        void printerNameRoundTrip() {
            PrintFileRequest req = new PrintFileRequest();
            req.setPrinterName("HP LaserJet");
            assertThat(req.getPrinterName()).isEqualTo("HP LaserJet");
        }

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            PrintFileRequest req = new PrintFileRequest();
            req.setFileId("file-7");
            assertThat(req.getFileId()).isEqualTo("file-7");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            PrintFileRequest a = new PrintFileRequest();
            PrintFileRequest b = new PrintFileRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when printerName differs")
        void differByPrinterName() {
            PrintFileRequest a = new PrintFileRequest();
            PrintFileRequest b = new PrintFileRequest();
            b.setPrinterName("Canon");
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            PrintFileRequest a = new PrintFileRequest();
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
            PrintFileRequest req = new PrintFileRequest();
            req.setPrinterName("Canon");
            assertThat(req.toString()).isNotNull().contains("printerName=Canon");
        }
    }
}
