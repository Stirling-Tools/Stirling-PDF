package stirling.software.proprietary.model.api.ai;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A single page of extracted text for RAG ingest requests. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AiRagPageText {

    private int pageNumber;

    private String text;
}
