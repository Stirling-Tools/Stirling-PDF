package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import org.springframework.web.multipart.MultipartFile;
import stirling.software.SPDF.model.api.PDFFile;
import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.model.SortTypes;
@Data
public class RearrangePagesRequest extends PDFWithPageNums {

    @Schema(implementation = SortTypes.class, description = "The custom mode for page rearrangement. Valid values are:\n"
            + "REVERSE_ORDER: Reverses the order of all pages.\n"
            + "DUPLEX_SORT: Sorts pages as if all fronts were scanned then all backs in reverse (1, n, 2, n-1, ...). "
            + "BOOKLET_SORT: Arranges pages for booklet printing (last, first, second, second last, ...).\n"
            + "ODD_EVEN_SPLIT: Splits and arranges pages into odd and even numbered pages.\n"
            + "REMOVE_FIRST: Removes the first page.\n" + "REMOVE_LAST: Removes the last page.\n"
            + "REMOVE_FIRST_AND_LAST: Removes both the first and the last pages.\n")
    private String customMode;
    
    
    
}
