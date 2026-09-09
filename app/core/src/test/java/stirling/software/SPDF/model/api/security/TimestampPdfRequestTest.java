package stirling.software.SPDF.model.api.security;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("TimestampPdfRequest")
class TimestampPdfRequestTest {

    @Test
    @DisplayName("tsaUrl and inherited fields round-trip")
    void roundTrip() {
        TimestampPdfRequest req = new TimestampPdfRequest();
        req.setTsaUrl("http://timestamp.example.com");
        req.setFileId("file-2");

        assertThat(req.getTsaUrl()).isEqualTo("http://timestamp.example.com");
        assertThat(req.getFileId()).isEqualTo("file-2");
    }

    @Test
    @DisplayName("equals/hashCode for equal pair")
    void equalPair() {
        TimestampPdfRequest a = new TimestampPdfRequest();
        a.setTsaUrl("http://ts");
        TimestampPdfRequest b = new TimestampPdfRequest();
        b.setTsaUrl("http://ts");

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
    }

    @Test
    @DisplayName("differs when tsaUrl differs and vs null/other type")
    void notEqual() {
        TimestampPdfRequest a = new TimestampPdfRequest();
        a.setTsaUrl("http://a");
        TimestampPdfRequest b = new TimestampPdfRequest();
        b.setTsaUrl("http://b");

        assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
    }

    @Test
    @DisplayName("toString contains class name and value")
    void toStringContent() {
        TimestampPdfRequest a = new TimestampPdfRequest();
        a.setTsaUrl("http://digicert");
        assertThat(a.toString()).contains("TimestampPdfRequest").contains("http://digicert");
    }
}
