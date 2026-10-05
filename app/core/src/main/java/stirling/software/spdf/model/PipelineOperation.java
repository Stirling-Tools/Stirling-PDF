package stirling.software.spdf.model;

import java.util.Map;

import lombok.Data;

@Data
public class PipelineOperation {
    private String operation;
    private Map<String, Object> parameters;
}
