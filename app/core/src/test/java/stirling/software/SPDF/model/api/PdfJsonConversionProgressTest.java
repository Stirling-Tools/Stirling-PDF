package stirling.software.SPDF.model.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class PdfJsonConversionProgressTest {

    @Nested
    @DisplayName("of(percent, stage, message)")
    class ThreeArgFactory {

        @Test
        @DisplayName("sets fields and leaves complete false")
        void buildsProgress() {
            PdfJsonConversionProgress p =
                    PdfJsonConversionProgress.of(42, "loading", "Loading pages");

            assertThat(p.getPercent()).isEqualTo(42);
            assertThat(p.getStage()).isEqualTo("loading");
            assertThat(p.getMessage()).isEqualTo("Loading pages");
            assertThat(p.isComplete()).isFalse();
            assertThat(p.getCurrent()).isNull();
            assertThat(p.getTotal()).isNull();
        }
    }

    @Nested
    @DisplayName("of(percent, stage, message, current, total)")
    class FiveArgFactory {

        @Test
        @DisplayName("includes current and total counters")
        void buildsProgressWithCounters() {
            PdfJsonConversionProgress p =
                    PdfJsonConversionProgress.of(50, "pages", "Processing", 3, 6);

            assertThat(p.getPercent()).isEqualTo(50);
            assertThat(p.getStage()).isEqualTo("pages");
            assertThat(p.getMessage()).isEqualTo("Processing");
            assertThat(p.getCurrent()).isEqualTo(3);
            assertThat(p.getTotal()).isEqualTo(6);
            assertThat(p.isComplete()).isFalse();
        }
    }

    @Nested
    @DisplayName("complete()")
    class CompleteFactory {

        @Test
        @DisplayName("marks 100 percent complete")
        void buildsComplete() {
            PdfJsonConversionProgress p = PdfJsonConversionProgress.complete();

            assertThat(p.getPercent()).isEqualTo(100);
            assertThat(p.getStage()).isEqualTo("complete");
            assertThat(p.getMessage()).isEqualTo("Conversion complete");
            assertThat(p.isComplete()).isTrue();
        }
    }

    @Nested
    @DisplayName("builder and accessors")
    class BuilderAndAccessors {

        @Test
        @DisplayName("builder populates all fields")
        void builder() {
            PdfJsonConversionProgress p =
                    PdfJsonConversionProgress.builder()
                            .percent(10)
                            .stage("init")
                            .message("starting")
                            .complete(false)
                            .current(1)
                            .total(5)
                            .build();

            assertThat(p.getPercent()).isEqualTo(10);
            assertThat(p.getStage()).isEqualTo("init");
            assertThat(p.getCurrent()).isEqualTo(1);
            assertThat(p.getTotal()).isEqualTo(5);
        }

        @Test
        @DisplayName("no-arg constructor with setters works")
        void noArgConstructor() {
            PdfJsonConversionProgress p = new PdfJsonConversionProgress();
            p.setPercent(5);
            p.setStage("s");
            p.setMessage("m");
            p.setComplete(true);
            p.setCurrent(2);
            p.setTotal(4);

            assertThat(p.getPercent()).isEqualTo(5);
            assertThat(p.isComplete()).isTrue();
        }

        @Test
        @DisplayName("equals/hashCode/toString")
        void equality() {
            PdfJsonConversionProgress a = new PdfJsonConversionProgress(1, "s", "m", false, 1, 2);
            PdfJsonConversionProgress b = new PdfJsonConversionProgress(1, "s", "m", false, 1, 2);

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
            assertThat(a).isNotEqualTo(null).isNotEqualTo("x");
            assertThat(a.toString()).contains("PdfJsonConversionProgress");
        }
    }
}
