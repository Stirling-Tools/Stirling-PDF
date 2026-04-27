package stirling.software.common.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class EditTextOperation {

    @Schema(
            description = "The text to find. Treated as a literal string unless useRegex is true.",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String find;

    @Schema(
            description =
                    "The replacement text. May be empty to delete the matched text. When useRegex"
                            + " is true, supports backreferences such as $1.",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String replace;
}
