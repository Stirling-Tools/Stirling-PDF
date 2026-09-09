package stirling.software.SPDF.model.api;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("SplitPagesRequest")
class SplitPagesRequestTest {

    @Nested
    @DisplayName("accessors and equality")
    class Accessors {

        @Test
        @DisplayName("pageNumbers accessor round-trips")
        void roundTrip() {
            SplitPagesRequest req = new SplitPagesRequest();
            req.setPageNumbers("2,5");
            req.setFileId("file-1");

            assertThat(req.getPageNumbers()).isEqualTo("2,5");
            assertThat(req.getFileId()).isEqualTo("file-1");
        }

        @Test
        @DisplayName("equal pair shares hashCode")
        void equalPair() {
            SplitPagesRequest a = new SplitPagesRequest();
            a.setPageNumbers("2");
            SplitPagesRequest b = new SplitPagesRequest();
            b.setPageNumbers("2");

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differs when pageNumbers differs and vs null/other type")
        void notEqual() {
            SplitPagesRequest a = new SplitPagesRequest();
            a.setPageNumbers("2");
            SplitPagesRequest b = new SplitPagesRequest();
            b.setPageNumbers("3");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name and value")
        void toStringContent() {
            SplitPagesRequest a = new SplitPagesRequest();
            a.setPageNumbers("2,5");
            assertThat(a.toString()).contains("SplitPagesRequest").contains("2,5");
        }
    }

    @Nested
    @DisplayName("getPageNumbersList")
    class PageList {

        @Test
        @DisplayName("explicit ranges resolve against the document page count")
        void explicitRange() {
            SplitPagesRequest req = new SplitPagesRequest();
            req.setPageNumbers("1,3,5-7");
            PDDocument doc = mock(PDDocument.class);
            when(doc.getNumberOfPages()).thenReturn(10);

            List<Integer> result = req.getPageNumbersList(doc, true);

            assertThat(result).containsExactly(1, 3, 5, 6, 7);
        }

        @Test
        @DisplayName("all resolves to every page")
        void allPages() {
            SplitPagesRequest req = new SplitPagesRequest();
            req.setPageNumbers("all");
            PDDocument doc = mock(PDDocument.class);
            when(doc.getNumberOfPages()).thenReturn(3);

            assertThat(req.getPageNumbersList(doc, true)).containsExactly(1, 2, 3);
        }
    }
}
