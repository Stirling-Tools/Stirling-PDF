package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("UrlToPdfRequest")
class UrlToPdfRequestTest {

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setter round trips the url field")
        void setter() {
            UrlToPdfRequest req = new UrlToPdfRequest();
            req.setUrlInput("https://example.com");

            assertThat(req.getUrlInput()).isEqualTo("https://example.com");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("equal instances are equal and share a hashCode")
        void equalInstances() {
            UrlToPdfRequest a = new UrlToPdfRequest();
            a.setUrlInput("https://example.com");
            UrlToPdfRequest b = new UrlToPdfRequest();
            b.setUrlInput("https://example.com");

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing field breaks equality")
        void notEqual() {
            UrlToPdfRequest a = new UrlToPdfRequest();
            a.setUrlInput("https://example.com");
            UrlToPdfRequest b = new UrlToPdfRequest();
            b.setUrlInput("https://other.com");

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            UrlToPdfRequest req = new UrlToPdfRequest();
            req.setUrlInput("https://example.com");

            assertThat(req.toString()).isNotNull().contains("https://example.com");
        }
    }
}
