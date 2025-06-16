package stirling.software.SPDF.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import lombok.Data;

@Data
public class PipelineConfig {
    private String name;

    @JsonProperty("pipeline")
    private List<PipelineOperation> operations;

    private String outputDir;

    @JsonProperty("outputFileName")
    private String outputPattern;
}
