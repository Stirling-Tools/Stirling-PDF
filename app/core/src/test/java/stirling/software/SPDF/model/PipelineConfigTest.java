package stirling.software.SPDF.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class PipelineConfigTest {

    @Nested
    @DisplayName("PipelineConfig")
    class Config {

        @Test
        @DisplayName("accessors round-trip including JSON-aliased fields")
        void roundTrip() {
            PipelineOperation op = new PipelineOperation();
            op.setOperation("rotate");
            op.setParameters(Map.of("angle", 90));

            PipelineConfig config = new PipelineConfig();
            config.setName("my pipeline");
            config.setOperations(List.of(op));
            config.setOutputDir("/out");
            config.setOutputPattern("{name}-out");

            assertThat(config.getName()).isEqualTo("my pipeline");
            assertThat(config.getOperations()).containsExactly(op);
            assertThat(config.getOutputDir()).isEqualTo("/out");
            assertThat(config.getOutputPattern()).isEqualTo("{name}-out");
        }

        @Test
        @DisplayName("equals and hashCode reflect content")
        void equality() {
            PipelineConfig a = new PipelineConfig();
            a.setName("p");
            PipelineConfig b = new PipelineConfig();
            b.setName("p");

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
            assertThat(a.toString()).contains("PipelineConfig");
        }
    }

    @Nested
    @DisplayName("PipelineOperation")
    class Operation {

        @Test
        @DisplayName("accessors round-trip")
        void roundTrip() {
            PipelineOperation op = new PipelineOperation();
            op.setOperation("merge");
            Map<String, Object> params = Map.of("k", "v");
            op.setParameters(params);

            assertThat(op.getOperation()).isEqualTo("merge");
            assertThat(op.getParameters()).isEqualTo(params);
        }

        @Test
        @DisplayName("equals/hashCode/toString")
        void equality() {
            PipelineOperation a = new PipelineOperation();
            a.setOperation("x");
            PipelineOperation b = new PipelineOperation();
            b.setOperation("x");

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
            assertThat(a).isNotEqualTo(new PipelineOperation());
            assertThat(a.toString()).contains("PipelineOperation");
        }
    }
}
