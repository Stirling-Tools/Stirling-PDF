package stirling.software.proprietary.model.api.documents;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Response for the processor Documents review queue. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProcessorDocumentsResponseDto {
    private ProcessorDocumentsSummaryDto summary;
    private List<ProcessorReviewDocumentDto> documents;
}
