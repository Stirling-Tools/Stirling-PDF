package stirling.software.SPDF.model;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

public class PipelineConfig {
    private String name;

    @JsonProperty("pipeline")
    private List<PipelineOperation> operations;

    private String outputDir;

    @JsonProperty("outputFileName")
    private String outputPattern;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public List<PipelineOperation> getOperations() {
        return operations;
    }

    public void setOperations(List<PipelineOperation> operations) {
        this.operations = operations;
    }

    public String getOutputDir() {
        return outputDir;
    }

    public void setOutputDir(String outputDir) {
        this.outputDir = outputDir;
    }

    public String getOutputPattern() {
        return outputPattern;
    }

    public void setOutputPattern(String outputPattern) {
        this.outputPattern = outputPattern;
    }
}
