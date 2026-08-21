package stirling.software.SPDF.model.api;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("SplitPdfByChaptersRequest")
class SplitPdfByChaptersRequestTest {

    @Test
    @DisplayName("accessors round-trip")
    void roundTrip() {
        SplitPdfByChaptersRequest req = new SplitPdfByChaptersRequest();
        req.setIncludeMetadata(true);
        req.setAllowDuplicates(false);
        req.setBookmarkLevel(2);
        req.setFileId("file-1");

        assertThat(req.getIncludeMetadata()).isTrue();
        assertThat(req.getAllowDuplicates()).isFalse();
        assertThat(req.getBookmarkLevel()).isEqualTo(2);
        assertThat(req.getFileId()).isEqualTo("file-1");
    }

    // callSuper=false: equality ignores inherited PDFFile fields.
    @Test
    @DisplayName("equals ignores inherited fields (callSuper=false)")
    void equalsIgnoresSuper() {
        SplitPdfByChaptersRequest a = new SplitPdfByChaptersRequest();
        a.setBookmarkLevel(1);
        a.setFileId("one");
        SplitPdfByChaptersRequest b = new SplitPdfByChaptersRequest();
        b.setBookmarkLevel(1);
        b.setFileId("two");

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
    }

    @Test
    @DisplayName("differs when own field differs and vs null/other type")
    void notEqual() {
        SplitPdfByChaptersRequest a = new SplitPdfByChaptersRequest();
        a.setBookmarkLevel(1);
        SplitPdfByChaptersRequest b = new SplitPdfByChaptersRequest();
        b.setBookmarkLevel(2);

        assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
    }

    @Test
    @DisplayName("toString contains class name")
    void toStringContent() {
        assertThat(new SplitPdfByChaptersRequest().toString())
                .contains("SplitPdfByChaptersRequest");
    }
}
