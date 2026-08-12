package stirling.software.proprietary.model.api.documents;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A document in the review queue, derived from the audit trail of a processed file. Extraction
 * fields ({@code confidence}, {@code extractions}) are absent/empty - that data doesn't exist yet.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PortalReviewDocumentDto {
    private String id;
    private String name;
    private String type;

    /** Where it was processed: "API" or "Editor". */
    private String product;

    /** The operation / pipeline, e.g. "Compress PDF" (or "Editor"). */
    private String action;

    /** The user who ran it. */
    private String user;

    /** processed | error */
    private String status;

    private String source;

    /** Overall confidence 0..1, or null when there's no extraction data. */
    private Double confidence;

    private int fieldsExtracted;

    /** Relative-time string, e.g. "4m ago". */
    private String time;

    private boolean sensitive;
    private List<PortalExtractionDto> extractions;
    private List<PortalDocAuditEventDto> audit;
}
