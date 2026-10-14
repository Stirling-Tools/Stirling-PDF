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
                    "Omit or CUSTOM to use pageNumbers. DUPLEX_SORT expects all fronts,"
                            + " then backs reversed. DUPLICATE repeats each page N times (N in"
                            + " pageNumbers, default 2).")
    private String customMode;
}
