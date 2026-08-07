package stirling.software.SPDF.model.api.analysis;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class WordCountRequest extends PDFFile {

    @Schema(
            description = "Include a per-page breakdown of word and character counts",
            defaultValue = "false")
    private boolean includePerPage = false;
}
