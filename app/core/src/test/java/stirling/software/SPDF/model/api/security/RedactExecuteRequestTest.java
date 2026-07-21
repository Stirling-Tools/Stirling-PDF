package stirling.software.SPDF.model.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.security.RedactExecuteRequest.ImageBox;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest.RedactStyle;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest.RedactionStrategy;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest.TextRange;

class RedactExecuteRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("collections default to empty lists, not null")
        void emptyCollections() {
            RedactExecuteRequest req = new RedactExecuteRequest();

            assertThat(req.getTextValues()).isEmpty();
            assertThat(req.getRegexPatterns()).isEmpty();
            assertThat(req.getWipePages()).isEmpty();
            assertThat(req.getRanges()).isEmpty();
            assertThat(req.getImageBoxes()).isEmpty();
            assertThat(req.getRedactImagePages()).isNull();
        }

        @Test
        @DisplayName("style defaults to a fresh RedactStyle")
        void styleDefault() {
            RedactExecuteRequest req = new RedactExecuteRequest();

            assertThat(req.getStyle()).isNotNull();
            assertThat(req.getStyle().getColor()).isEqualTo("#000000");
            assertThat(req.getStyle().getPadding()).isZero();
            assertThat(req.getStyle().isConvertToImage()).isFalse();
            assertThat(req.getStyle().getStrategy()).isEqualTo(RedactionStrategy.AUTO);
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters update collections and style")
        void setters() {
            RedactExecuteRequest req = new RedactExecuteRequest();
            req.setTextValues(List.of("secret"));
            req.setRegexPatterns(List.of("\\d+"));
            req.setWipePages(List.of(1, 2));
            req.setRedactImagePages(List.of(3));
            RedactStyle style = new RedactStyle();
            style.setColor("#FF0000");
            style.setPadding(2.5f);
            style.setConvertToImage(true);
            style.setStrategy(RedactionStrategy.IMAGE_FINALIZE);
            req.setStyle(style);

            assertThat(req.getTextValues()).containsExactly("secret");
            assertThat(req.getRegexPatterns()).containsExactly("\\d+");
            assertThat(req.getWipePages()).containsExactly(1, 2);
            assertThat(req.getRedactImagePages()).containsExactly(3);
            assertThat(req.getStyle().getColor()).isEqualTo("#FF0000");
            assertThat(req.getStyle().getPadding()).isEqualTo(2.5f);
            assertThat(req.getStyle().isConvertToImage()).isTrue();
            assertThat(req.getStyle().getStrategy()).isEqualTo(RedactionStrategy.IMAGE_FINALIZE);
        }
    }

    @Nested
    @DisplayName("TextRange record")
    class TextRangeRecord {

        @Test
        @DisplayName("keeps provided start and end strings")
        void keepsValues() {
            TextRange range = new TextRange("begin", "end");

            assertThat(range.startString()).isEqualTo("begin");
            assertThat(range.endString()).isEqualTo("end");
        }

        @Test
        @DisplayName("compact constructor coerces null end string to empty")
        void nullEndBecomesEmpty() {
            TextRange range = new TextRange("begin", null);

            assertThat(range.endString()).isEmpty();
        }

        @Test
        @DisplayName("equal records are equal")
        void equality() {
            assertThat(new TextRange("a", "b")).isEqualTo(new TextRange("a", "b"));
        }
    }

    @Nested
    @DisplayName("ImageBox record")
    class ImageBoxRecord {

        @Test
        @DisplayName("exposes page index and coordinates")
        void accessors() {
            ImageBox box = new ImageBox(2, 1.0f, 2.0f, 3.0f, 4.0f);

            assertThat(box.pageIndex()).isEqualTo(2);
            assertThat(box.x1()).isEqualTo(1.0f);
            assertThat(box.y1()).isEqualTo(2.0f);
            assertThat(box.x2()).isEqualTo(3.0f);
            assertThat(box.y2()).isEqualTo(4.0f);
        }
    }

    @Nested
    @DisplayName("RedactionStrategy enum")
    class StrategyEnum {

        @Test
        @DisplayName("exposes the documented constants")
        void constants() {
            assertThat(RedactionStrategy.values())
                    .containsExactly(
                            RedactionStrategy.AUTO,
                            RedactionStrategy.OVERLAY_ONLY,
                            RedactionStrategy.IMAGE_FINALIZE);
            assertThat(RedactionStrategy.valueOf("OVERLAY_ONLY"))
                    .isSameAs(RedactionStrategy.OVERLAY_ONLY);
        }
    }
}
