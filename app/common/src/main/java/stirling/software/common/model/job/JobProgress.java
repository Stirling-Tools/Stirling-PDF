package stirling.software.common.model.job;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class JobProgress {
    private String jobId;
    private String status;
    private int percentComplete;
    private String message;
}
