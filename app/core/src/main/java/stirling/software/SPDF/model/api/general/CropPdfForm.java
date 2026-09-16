package stirling.software.SPDF.model.api.general;

import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.common.util.GeneralUtils;

@Data
@EqualsAndHashCode(callSuper = true)
public class CropPdfForm extends PDFWithPageNums {

    // Legacy clients omit pageNumbers; keep them cropping every page rather than
    // falling back to parsePageList's single-first-page default.
    @Override
    @Hidden
    public List<Integer> getPageNumbersList(PDDocument doc, boolean oneBased) {
        String pageNumbers = getPageNumbers();
        return GeneralUtils.parsePageList(
                (pageNumbers == null || pageNumbers.isBlank()) ? "all" : pageNumbers,
                doc.getNumberOfPages(),
                oneBased);
    }

    @Schema(
            description = "The x-coordinate of the top-left corner of the crop area",
            type = "number")
    private Float x;

    @Schema(
            description = "The y-coordinate of the top-left corner of the crop area",
            type = "number")
    private Float y;

    @Schema(description = "The width of the crop area", type = "number")
    private Float width;

    @Schema(description = "The height of the crop area", type = "number")
    private Float height;

    @Schema(
            description = "Whether to remove text outside the crop area (keeps images)",
            type = "boolean")
    private boolean removeDataOutsideCrop = true;

    @Schema(description = "Enable auto-crop to detect and remove white space", type = "boolean")
    private boolean autoCrop = false;
}
