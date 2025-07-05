package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotNull;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PrintFileRequest extends PDFFile {

    @Schema(
            description = "Name of printer to match against",
            requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull
    private String printerName;
}
