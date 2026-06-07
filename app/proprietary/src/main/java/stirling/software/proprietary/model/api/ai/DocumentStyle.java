package stirling.software.proprietary.model.api.ai;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.Pattern;

import lombok.Data;

@Data
@Schema(description = "Visual style options for generated documents")
public class DocumentStyle {

    @Pattern(regexp = "^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{1,30}$")
    @Schema(description = "Accent/heading colour (CSS colour value, e.g. '#1e3a5f')")
    private String primaryColor;

    @Pattern(regexp = "^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{1,30}$")
    @Schema(description = "Page background colour (CSS colour value, e.g. '#ffffff')")
    private String backgroundColor;

    @Pattern(regexp = "^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{1,30}$")
    @Schema(description = "Body text colour (auto-set for dark backgrounds)")
    private String bodyTextColor;
}
