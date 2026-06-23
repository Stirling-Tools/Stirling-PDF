package stirling.software.SPDF.model.api;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("PDFWithPageSize")
class PDFWithPageSizeTest {

    @Test
    @DisplayName("orientation defaults to PORTRAIT, pageSize null")
    void defaults() {
        PDFWithPageSize req = new PDFWithPageSize();
        assertThat(req.getOrientation()).isEqualTo("PORTRAIT");
        assertThat(req.getPageSize()).isNull();
    }

    @Test
    @DisplayName("accessors round-trip")
    void roundTrip() {
        PDFWithPageSize req = new PDFWithPageSize();
        req.setPageSize("A4");
        req.setOrientation("LANDSCAPE");
        req.setFileId("file-1");

        assertThat(req.getPageSize()).isEqualTo("A4");
        assertThat(req.getOrientation()).isEqualTo("LANDSCAPE");
        assertThat(req.getFileId()).isEqualTo("file-1");
    }

    @Test
    @DisplayName("equals/hashCode for equal pair")
    void equalPair() {
        PDFWithPageSize a = new PDFWithPageSize();
        a.setPageSize("A4");
        PDFWithPageSize b = new PDFWithPageSize();
        b.setPageSize("A4");

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
    }

    @Test
    @DisplayName("differs when pageSize differs and vs null/other type")
    void notEqual() {
        PDFWithPageSize a = new PDFWithPageSize();
        a.setPageSize("A4");
        PDFWithPageSize b = new PDFWithPageSize();
        b.setPageSize("LETTER");

        assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
    }

    @Test
    @DisplayName("toString contains class name and value")
    void toStringContent() {
        PDFWithPageSize a = new PDFWithPageSize();
        a.setPageSize("LEGAL");
        assertThat(a.toString()).contains("PDFWithPageSize").contains("LEGAL");
    }
}
