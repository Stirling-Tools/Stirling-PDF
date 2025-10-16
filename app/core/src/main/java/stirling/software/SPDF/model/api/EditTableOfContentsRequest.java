package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = false)
public class EditTableOfContentsRequest extends PDFFile {

    @Schema(
            description = "Bookmark structure in JSON format",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "[]",
            example =
                    "[{\"title\":\"Chapter 1\",\"pageNumber\":1,\"children\":[{\"title\":\"Section"
                            + " 1.1\",\"pageNumber\":2}]}]")
    private String bookmarkData;
}
