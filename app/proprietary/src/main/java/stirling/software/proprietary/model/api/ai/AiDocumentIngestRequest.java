package stirling.software.proprietary.model.api.ai;

import java.time.Instant;
import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Body for {@code POST /api/v1/documents} on the AI engine. Sent by Java when the engine reports
 * {@code need_ingest} and the requested document's extracted content must be stored before the
 * workflow can continue.
 *
 * <p>{@code ownerId} is the tenant the doc belongs to (a user for personal uploads, an org for
 * shared content). {@code readPrincipals} is the explicit list of principals granted read access.
 * {@code expiresAt} is when the engine's reaper should delete this doc; {@code null} means
 * "persistent until explicit delete" (used for org-shared content). Java picks the value per doc;
 * the engine does not default it.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AiDocumentIngestRequest {

    private String documentId;

    private String source;

    private List<AiPageText> pageText;

    private String ownerId;

    private List<String> readPrincipals;

    private Instant expiresAt;
}
