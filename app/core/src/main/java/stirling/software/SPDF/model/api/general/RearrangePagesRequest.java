package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.SortTypes;
import stirling.software.SPDF.model.api.PDFWithPageNums;

@Data
@EqualsAndHashCode(callSuper = true)
public class RearrangePagesRequest extends PDFWithPageNums {

    @Schema(
            implementation = SortTypes.class,
            description =
                    "Omit or CUSTOM to use pageNumbers. Or: REVERSE_ORDER, DUPLEX_SORT"
                            + " (input: all fronts, then backs reversed), BOOKLET_SORT,"
                            + " SIDE_STITCH_BOOKLET_SORT, ODD_EVEN_SPLIT (odd then even pages),"
                            + " REMOVE_FIRST, REMOVE_LAST, REMOVE_FIRST_AND_LAST,"
                            + " DUPLICATE (each page N times; N in pageNumbers, default 2)")
    private String customMode;
}
