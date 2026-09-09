package stirling.software.proprietary.model.api.documents;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A single extracted field. Empty for audit-derived documents (no extraction data yet). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PortalExtractionDto {
    private String field;
    private String value;
    private double confidence;
}
