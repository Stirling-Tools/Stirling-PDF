/**
 * Description: Enter description
 * Author: Your Name
 * Date: 2025-06-19
 * Time: 17:06:51
 */


package stirling.software.SPDF.model;

import java.util.Map;

import lombok.Data;

@Data
public class PipelineOperation {
    private String operation;
    private Map<String, Object> parameters;
}
