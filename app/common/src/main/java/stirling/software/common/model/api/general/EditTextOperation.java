package stirling.software.common.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class EditTextOperation {

    @Schema(description = "The literal text to find.", requiredMode = Schema.RequiredMode.REQUIRED)
    private String find;

    @Schema(
            description = "The replacement text. May be empty to delete the matched text.",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String replace;
}
