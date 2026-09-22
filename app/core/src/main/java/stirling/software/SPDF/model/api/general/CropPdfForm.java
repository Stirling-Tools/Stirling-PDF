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

    // The base model marks pageNumbers required, but this endpoint treats an
    // omitted or blank value as "all" (see above): advertise it as optional so
    // generated clients do not fail local validation for a legal request.
    @Override
    @Schema(
            description =
                    "Pages to crop (e.g. '1, 3, 5-8' or 'all'). Omit or leave blank for all pages.",
            defaultValue = "all",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    public String getPageNumbers() {
        return super.getPageNumbers();
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
