package stirling.software.proprietary.model.api.ai;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Body for {@code POST /api/v1/rag/documents} on the AI engine. Sent by Java when the engine
 * reports {@code need_ingest} and the requested document's extracted content must be stored before
 * the workflow can continue.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AiRagIngestRequest {

    private String documentId;

    private String source;

    private List<AiRagPageText> pageText;
}
