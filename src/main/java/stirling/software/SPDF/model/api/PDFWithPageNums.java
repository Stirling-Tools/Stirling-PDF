package stirling.software.SPDF.model.api;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.utils.GeneralUtils;

@Data
@NoArgsConstructor
@Slf4j
@EqualsAndHashCode(callSuper = true)
public class PDFWithPageNums extends PDFFile {

    @Schema(
            description =
                    "The pages to select, Supports ranges (e.g., '1,3,5-9'), or 'all' or functions in the"
                            + " format 'an+b' where 'a' is the multiplier of the page number 'n', and 'b' is a"
                            + " constant (e.g., '2n+1', '3n', '6n-5')\"")
    private String pageNumbers;

    @Hidden
    public List<Integer> getPageNumbersList(boolean zeroCount) {
        int pageCount = 0;
        try {
            pageCount = Loader.loadPDF(getFileInput().getBytes()).getNumberOfPages();
        } catch (IOException e) {
            // TODO Auto-generated catch block
            log.error("exception", e);
        }
        return GeneralUtils.parsePageList(pageNumbers, pageCount, zeroCount);
    }

    @Hidden
    public List<Integer> getPageNumbersList(PDDocument doc, boolean zeroCount) {
        int pageCount = 0;
        pageCount = doc.getNumberOfPages();
        return GeneralUtils.parsePageList(pageNumbers, pageCount, zeroCount);
    }
}
