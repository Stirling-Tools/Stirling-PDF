package stirling.software.proprietary.model.api.documents;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Response for the portal Documents review queue. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PortalDocumentsResponseDto {
    private PortalDocumentsSummaryDto summary;
    private List<PortalReviewDocumentDto> documents;
}
