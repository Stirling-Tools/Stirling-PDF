/**
 * Description: Enter description
 * Author: Your Name
 * Date: 2025-06-19
 * Time: 17:06:51
 */


package stirling.software.SPDF.model;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

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
