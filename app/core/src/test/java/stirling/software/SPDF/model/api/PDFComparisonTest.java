package stirling.software.SPDF.model.api;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("PDFComparison")
class PDFComparisonTest {

    @Test
    @DisplayName("comparator accessor round-trips")
    void roundTrip() {
        PDFComparison req = new PDFComparison();
        req.setComparator("Greater");
        req.setFileId("file-1");

        assertThat(req.getComparator()).isEqualTo("Greater");
        assertThat(req.getFileId()).isEqualTo("file-1");
    }

    @Test
    @DisplayName("equals/hashCode for equal pair")
    void equalPair() {
        PDFComparison a = new PDFComparison();
        a.setComparator("Equal");
        PDFComparison b = new PDFComparison();
        b.setComparator("Equal");

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
    }

    @Test
    @DisplayName("differs when comparator differs and vs null/other type")
    void notEqual() {
        PDFComparison a = new PDFComparison();
        a.setComparator("Greater");
        PDFComparison b = new PDFComparison();
        b.setComparator("Less");

        assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
    }

    @Test
    @DisplayName("toString contains class name and value")
    void toStringContent() {
        PDFComparison a = new PDFComparison();
        a.setComparator("Greater");
        assertThat(a.toString()).contains("PDFComparison").contains("Greater");
    }
}
