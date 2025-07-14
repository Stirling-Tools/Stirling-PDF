package stirling.software.common.model.job;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class JobResponse<T> {
    private boolean async;
    private String jobId;
    private T result;
}
