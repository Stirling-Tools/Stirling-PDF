package stirling.software.SPDF.model.api;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

// Empty-body subclass of PDFWithImageFormatRequest - exercised via inherited format.
@DisplayName("PDFExtractImagesRequest")
class PDFExtractImagesRequestTest {

    @Test
    @DisplayName("inherited format accessor round-trips")
    void roundTrip() {
        PDFExtractImagesRequest req = new PDFExtractImagesRequest();
        req.setFormat("gif");
        req.setFileId("file-1");

        assertThat(req.getFormat()).isEqualTo("gif");
        assertThat(req.getFileId()).isEqualTo("file-1");
    }

    @Test
    @DisplayName("equals/hashCode for equal pair via inherited field")
    void equalPair() {
        PDFExtractImagesRequest a = new PDFExtractImagesRequest();
        a.setFormat("png");
        PDFExtractImagesRequest b = new PDFExtractImagesRequest();
        b.setFormat("png");

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
    }

    @Test
    @DisplayName("differs when inherited format differs and vs null/other type")
    void notEqual() {
        PDFExtractImagesRequest a = new PDFExtractImagesRequest();
        a.setFormat("png");
        PDFExtractImagesRequest b = new PDFExtractImagesRequest();
        b.setFormat("jpeg");

        assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
    }

    @Test
    @DisplayName("toString contains class name")
    void toStringContent() {
        assertThat(new PDFExtractImagesRequest().toString()).contains("PDFExtractImagesRequest");
    }
}
