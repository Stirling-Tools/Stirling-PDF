package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PDFWithPageSize extends PDFFile {

    @Schema(
            description =
                    "The scale of pages in the output PDF. Acceptable values are A0-A6 (with"
                            + " optional _LANDSCAPE suffix), LETTER, LETTER_LANDSCAPE, LEGAL,"
                            + " LEGAL_LANDSCAPE, KEEP.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {
                "A0",
                "A1",
                "A2",
                "A3",
                "A4",
                "A5",
                "A6",
                "A0_LANDSCAPE",
                "A1_LANDSCAPE",
                "A2_LANDSCAPE",
                "A3_LANDSCAPE",
                "A4_LANDSCAPE",
                "A5_LANDSCAPE",
                "A6_LANDSCAPE",
                "LETTER",
                "LEGAL",
                "LETTER_LANDSCAPE",
                "LEGAL_LANDSCAPE",
                "KEEP"
            })
    private String pageSize;
}
