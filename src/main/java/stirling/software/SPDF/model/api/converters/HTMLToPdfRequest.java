package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class HTMLToPdfRequest extends PDFFile {

    @Schema(
            description = "Zoom level for displaying the website. Default is '1'.",
            defaultValue = "1")
    private float zoom;

    @Schema(description = "Width of the page in centimeters.")
    private Float pageWidth;

    @Schema(description = "Height of the page in centimeters.")
    private Float pageHeight;

    @Schema(description = "Top margin of the page in millimeters.")
    private Float marginTop;

    @Schema(description = "Bottom margin of the page in millimeters.")
    private Float marginBottom;

    @Schema(description = "Left margin of the page in millimeters.")
    private Float marginLeft;

    @Schema(description = "Right margin of the page in millimeters.")
    private Float marginRight;

    @Schema(
            description = "Enable or disable rendering of website background.",
            allowableValues = {"Yes", "No"})
    private String printBackground;

    @Schema(
            description =
                    "Enable or disable the default header. The default header includes the name of the page on the left and the page number on the right.",
            allowableValues = {"Yes", "No"})
    private String defaultHeader;

    @Schema(
            description = "Change the CSS media type of the page. Defaults to 'print'.",
            allowableValues = {"none", "print", "screen"},
            defaultValue = "print")
    private String cssMediaType;
}
