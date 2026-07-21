package stirling.software.proprietary.model.api.documents;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** One event in a document's lifecycle timeline. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PortalDocAuditEventDto {
    private String id;

    /** ingested | extracted | flagged | reviewed | approved | archived | elevation */
    private String kind;

    /** Relative-time string, e.g. "2m ago". */
    private String time;

    private String actor;
    private String detail;
}
