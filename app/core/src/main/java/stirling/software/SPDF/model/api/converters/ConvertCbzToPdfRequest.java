package stirling.software.SPDF.model.api.converters;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.SingleFileInput;

@Data
@EqualsAndHashCode
public class ConvertCbzToPdfRequest implements SingleFileInput {

    @Schema(
            description = "The input CBZ file to be converted to a PDF file",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile fileInput;

    @Schema(
            description =
                    "File ID for server-side files. Either a job file id from an async run, or a"
                            + " persistent storage reference of the form storage:<id>.")
    private String fileId;

    @Schema(
            description = "Optimize the output PDF for ebook reading using Ghostscript",
            defaultValue = "false")
    private boolean optimizeForEbook;
}
