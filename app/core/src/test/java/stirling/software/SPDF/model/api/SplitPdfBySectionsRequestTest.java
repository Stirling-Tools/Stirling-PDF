package stirling.software.SPDF.model.api;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("SplitPdfBySectionsRequest")
class SplitPdfBySectionsRequestTest {

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("all accessors round-trip")
        void roundTrip() {
            SplitPdfBySectionsRequest req = new SplitPdfBySectionsRequest();
            req.setPageNumbers("SPLIT_ALL");
            req.setSplitMode("CUSTOM");
            req.setHorizontalDivisions(3);
            req.setVerticalDivisions(2);
            req.setMerge(true);
            req.setFileId("file-1");

            assertThat(req.getPageNumbers()).isEqualTo("SPLIT_ALL");
            assertThat(req.getSplitMode()).isEqualTo("CUSTOM");
            assertThat(req.getHorizontalDivisions()).isEqualTo(3);
            assertThat(req.getVerticalDivisions()).isEqualTo(2);
            assertThat(req.getMerge()).isTrue();
            assertThat(req.getFileId()).isEqualTo("file-1");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class EqualityContract {

        @Test
        @DisplayName("equal pair shares hashCode")
        void equalPair() {
            SplitPdfBySectionsRequest a = new SplitPdfBySectionsRequest();
            a.setHorizontalDivisions(2);
            SplitPdfBySectionsRequest b = new SplitPdfBySectionsRequest();
            b.setHorizontalDivisions(2);

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differs when a subclass field differs")
        void notEqualOnFieldDiff() {
            SplitPdfBySectionsRequest a = new SplitPdfBySectionsRequest();
            a.setVerticalDivisions(1);
            SplitPdfBySectionsRequest b = new SplitPdfBySectionsRequest();
            b.setVerticalDivisions(4);

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or unrelated type")
        void notEqualToOthers() {
            assertThat(new SplitPdfBySectionsRequest()).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name and a field value")
        void toStringContent() {
            SplitPdfBySectionsRequest a = new SplitPdfBySectionsRequest();
            a.setSplitMode("SPLIT_ALL");
            assertThat(a.toString()).contains("SplitPdfBySectionsRequest").contains("SPLIT_ALL");
        }
    }
}
