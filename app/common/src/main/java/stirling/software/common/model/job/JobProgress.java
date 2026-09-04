package stirling.software.common.model.job;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Live progress information for a running job. Attached to {@link JobResult}. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobProgress {

    /** Percent complete (0-100). */
    private int percent;

    /** Short human-readable status message, e.g. "OCR page 5 of 12". */
    private String message;

    /** Current step index (optional, for discrete stages/pages). */
    private Integer current;

    /** Total step count (optional, paired with {@link #current}). */
    private Integer total;
}
