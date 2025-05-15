package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
// @EqualsAndHashCode(callSuper = true)
public class RemoveHeaderFooterForm {

    @Schema(description = "Test Message", type = "string")
    private String message;
}
