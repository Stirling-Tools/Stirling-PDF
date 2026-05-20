package stirling.software.SPDF.model.api.general;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.common.model.api.general.EditTextOperation;

@Data
@EqualsAndHashCode(callSuper = true)
public class EditTextRequest extends PDFWithPageNums {

    @Schema(
            description =
                    "Ordered list of find/replace operations. Each replaces every occurrence on"
                            + " the selected pages, in order; later operations see the result of"
                            + " earlier ones (so 'foo'->'foos' then 'foos'->'bars' turns 'foo'"
                            + " into 'bars').",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private List<EditTextOperation> edits;

    @Schema(
            description =
                    "Whether matches must be whole words (boundaries determined by non-word"
                            + " characters)",
            defaultValue = "false")
    private Boolean wholeWordSearch;
}
