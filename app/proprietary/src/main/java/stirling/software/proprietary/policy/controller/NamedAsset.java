package stirling.software.proprietary.policy.controller;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import lombok.Data;

/**
 * A supporting file paired with the asset key a pipeline step references from its {@code
 * fileParameters}. The same key may appear on more than one asset to supply multiple files.
 */
@Data
@Schema(description = "A supporting file bound to the asset key a pipeline step references")
public class NamedAsset {

    @NotBlank
    @Schema(
            description = "Asset key referenced by a step's fileParameters",
            example = "company-logo")
    private String key;

    @NotNull
    @Schema(description = "The supporting file", format = "binary")
    private MultipartFile file;
}
