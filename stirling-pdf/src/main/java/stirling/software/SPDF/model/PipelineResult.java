/**
 * Description: Enter description
 * Author: Your Name
 * Date: 2025-06-19
 * Time: 17:06:51
 */


package stirling.software.SPDF.model;

import java.util.List;

import org.springframework.core.io.Resource;

import lombok.Data;

@Data
public class PipelineResult {
    private List<Resource> outputFiles;
    private boolean hasErrors;
    private boolean filtersApplied;
}
