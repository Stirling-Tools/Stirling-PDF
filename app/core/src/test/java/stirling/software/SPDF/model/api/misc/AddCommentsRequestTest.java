package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("AddCommentsRequest")
class AddCommentsRequestTest {

    private static final String SAMPLE =
            "[{\"pageIndex\":0,\"x\":72,\"y\":720,\"width\":20,\"height\":20,"
                    + "\"text\":\"Check this paragraph\"}]";

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("comments defaults to null")
        void commentsDefaultsNull() {
            assertThat(new AddCommentsRequest().getComments()).isNull();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("comments round-trips")
        void commentsRoundTrip() {
            AddCommentsRequest req = new AddCommentsRequest();
            req.setComments(SAMPLE);
            assertThat(req.getComments()).isEqualTo(SAMPLE);
        }

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            AddCommentsRequest req = new AddCommentsRequest();
            req.setFileId("file-9");
            assertThat(req.getFileId()).isEqualTo("file-9");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            AddCommentsRequest a = new AddCommentsRequest();
            AddCommentsRequest b = new AddCommentsRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when comments differs")
        void differByComments() {
            AddCommentsRequest a = new AddCommentsRequest();
            AddCommentsRequest b = new AddCommentsRequest();
            b.setComments(SAMPLE);
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            AddCommentsRequest a = new AddCommentsRequest();
            assertThat(a).isNotEqualTo(null);
            assertThat(a).isNotEqualTo("a string");
        }
    }

    @Nested
    @DisplayName("toString")
    class ToString {

        @Test
        @DisplayName("is non-null and contains a field value")
        void toStringContainsField() {
            AddCommentsRequest req = new AddCommentsRequest();
            req.setComments("hello");
            assertThat(req.toString()).isNotNull().contains("comments=hello");
        }
    }
}
