package stirling.software.SPDF.model;

import java.util.List;
import lombok.Data;
import org.springframework.core.io.Resource;

@Data
public class PipelineResult {
    private List<Resource> outputFiles;
    private boolean hasErrors;
    private boolean filtersApplied;
}
