package stirling.software.proprietary.policy.controller;

import java.util.ArrayList;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.Valid;

import lombok.Data;

import stirling.software.common.model.MultipartFile;

/**
 * The files supplied to a policy run: the primary documents and any keyed supporting assets. Bound
 * from the multipart request by the controller; the pipeline definition itself travels as a
 * separate typed {@code json} part.
 *
 * <p>Wire form: {@code fileInput} (repeated) for primaries, and {@code assets[i].key} / {@code
 * assets[i].file} for each supporting asset.
 */
@Data
@Schema(description = "Files for a policy run: primary documents plus keyed supporting assets")
public class PolicyRunFiles {

    @Schema(description = "Primary input documents", format = "binary")
    private List<MultipartFile> fileInput = new ArrayList<>();

    @Valid
    @Schema(description = "Supporting files, each bound to the asset key its step references")
    private List<NamedAsset> assets = new ArrayList<>();
}
