package stirling.software.SPDF.model.api;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("PDFComparisonAndCount")
class PDFComparisonAndCountTest {

    @Test
    @DisplayName("pageCount defaults to 0")
    void defaultPageCount() {
        assertThat(new PDFComparisonAndCount().getPageCount()).isZero();
    }

    @Test
    @DisplayName("pageCount and inherited comparator round-trip")
    void roundTrip() {
        PDFComparisonAndCount req = new PDFComparisonAndCount();
        req.setPageCount(5);
        req.setComparator("Greater");

        assertThat(req.getPageCount()).isEqualTo(5);
        assertThat(req.getComparator()).isEqualTo("Greater");
    }

    // callSuper=true: fresh defaults equal, breaks when own field differs.
    @Test
    @DisplayName("fresh defaults equal; differs when pageCount differs")
    void equality() {
        PDFComparisonAndCount a = new PDFComparisonAndCount();
        PDFComparisonAndCount b = new PDFComparisonAndCount();
        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

        b.setPageCount(3);
        assertThat(a).isNotEqualTo(b);
    }

    @Test
    @DisplayName("differs when inherited comparator differs")
    void inheritedDiff() {
        PDFComparisonAndCount a = new PDFComparisonAndCount();
        a.setComparator("Greater");
        PDFComparisonAndCount b = new PDFComparisonAndCount();
        b.setComparator("Less");

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    @DisplayName("not equal to null or unrelated type; toString contains class name")
    void notEqualAndToString() {
        assertThat(new PDFComparisonAndCount()).isNotEqualTo(null).isNotEqualTo("string");
        assertThat(new PDFComparisonAndCount().toString()).contains("PDFComparisonAndCount");
    }
}
