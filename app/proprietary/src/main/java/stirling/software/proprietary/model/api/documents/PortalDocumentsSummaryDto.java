package stirling.software.proprietary.model.api.documents;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** KPI strip for the documents queue. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PortalDocumentsSummaryDto {
    private int totalInQueue;
    private int processed;
    private int errors;
    private int processedToday;
}
