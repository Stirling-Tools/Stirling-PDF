package stirling.software.SPDF.model.api;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("PDFWithImageFormatRequest")
class PDFWithImageFormatRequestTest {

    @Test
    @DisplayName("format accessor round-trips")
    void roundTrip() {
        PDFWithImageFormatRequest req = new PDFWithImageFormatRequest();
        req.setFormat("jpeg");
        req.setFileId("file-1");

        assertThat(req.getFormat()).isEqualTo("jpeg");
        assertThat(req.getFileId()).isEqualTo("file-1");
    }

    @Test
    @DisplayName("equals/hashCode for equal pair")
    void equalPair() {
        PDFWithImageFormatRequest a = new PDFWithImageFormatRequest();
        a.setFormat("png");
        PDFWithImageFormatRequest b = new PDFWithImageFormatRequest();
        b.setFormat("png");

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
    }

    @Test
    @DisplayName("differs when format differs and vs null/other type")
    void notEqual() {
        PDFWithImageFormatRequest a = new PDFWithImageFormatRequest();
        a.setFormat("png");
        PDFWithImageFormatRequest b = new PDFWithImageFormatRequest();
        b.setFormat("gif");

        assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
    }

    @Test
    @DisplayName("toString contains class name and value")
    void toStringContent() {
        PDFWithImageFormatRequest a = new PDFWithImageFormatRequest();
        a.setFormat("png");
        assertThat(a.toString()).contains("PDFWithImageFormatRequest").contains("png");
    }
}
