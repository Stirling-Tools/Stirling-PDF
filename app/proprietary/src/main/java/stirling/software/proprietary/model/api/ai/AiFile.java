package stirling.software.proprietary.model.api.ai;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A file supplied to the AI engine, identified by a stable opaque id plus a display name.
 *
 * <p>Values MUST match {@code AiFile} in {@code engine/src/stirling/contracts/common.py}.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "File reference sent to the AI engine")
public class AiFile {

    @Schema(
            description =
                    "Opaque, stable identifier. Owned by Java; used as the RAG collection key.")
    private String id;

    @Schema(description = "Original filename, used by agents in user-facing prompts and responses.")
    private String name;
}
