package stirling.software.SPDF.model.api;

import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.util.GeneralUtils;

@Data
@EqualsAndHashCode(callSuper = true)
public class SplitPagesRequest extends PDFFile {

    @Schema(
            description =
                    "Split points - page numbers after which the PDF will be cut. For example,"
                            + " `\"2\"` produces two documents (pages 1-2 and pages 3+); `\"2,5\"`"
                            + " produces three (pages 1-2, 3-5, 6+). Supports ranges (e.g."
                            + " `\"1,3,5-9\"` splits after pages 1, 3, 5, 6, 7, 8, 9 — yielding 8"
                            + " documents), `\"all\"` (split after every page), or functions like"
                            + " `\"2n+1\"`, `\"3n\"`, `\"6n-5\"`.",
            defaultValue = "all",
            requiredMode = RequiredMode.REQUIRED)
    private String pageNumbers;

    @Hidden
    public List<Integer> getPageNumbersList(PDDocument doc, boolean oneBased) {
        int pageCount = doc.getNumberOfPages();
        return GeneralUtils.parsePageList(pageNumbers, pageCount, oneBased);
    }
}
