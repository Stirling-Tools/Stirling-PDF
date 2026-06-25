package stirling.software.SPDF.model.api;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

@DisplayName("EditTableOfContentsRequest")
class EditTableOfContentsRequestTest {

    @Test
    @DisplayName("accessors round-trip including inherited fields")
    void roundTrip() {
        EditTableOfContentsRequest req = new EditTableOfContentsRequest();
        req.setBookmarkData("[{\"title\":\"Chapter 1\"}]");
        req.setReplaceExisting(true);
        req.setFileId("file-1");
        req.setFileInput(new MockMultipartFile("f", new byte[] {1}));

        assertThat(req.getBookmarkData()).isEqualTo("[{\"title\":\"Chapter 1\"}]");
        assertThat(req.getReplaceExisting()).isTrue();
        assertThat(req.getFileId()).isEqualTo("file-1");
        assertThat(req.getFileInput()).isNotNull();
    }

    // callSuper=false: equality ignores inherited PDFFile fields.
    @Test
    @DisplayName("equals ignores inherited fields (callSuper=false)")
    void equalsIgnoresSuper() {
        EditTableOfContentsRequest a = new EditTableOfContentsRequest();
        a.setBookmarkData("data");
        a.setFileId("one");
        EditTableOfContentsRequest b = new EditTableOfContentsRequest();
        b.setBookmarkData("data");
        b.setFileId("two");

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
    }

    @Test
    @DisplayName("differs when own field differs and vs null/other type")
    void notEqual() {
        EditTableOfContentsRequest a = new EditTableOfContentsRequest();
        a.setBookmarkData("a");
        EditTableOfContentsRequest b = new EditTableOfContentsRequest();
        b.setBookmarkData("b");

        assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
    }

    @Test
    @DisplayName("toString contains class name and value")
    void toStringContent() {
        EditTableOfContentsRequest a = new EditTableOfContentsRequest();
        a.setBookmarkData("bookmarks");
        assertThat(a.toString()).contains("EditTableOfContentsRequest").contains("bookmarks");
    }
}
