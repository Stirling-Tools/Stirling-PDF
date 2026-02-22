package stirling.software.common.model;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Form field information with coordinates for interactive form viewer. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "Form field with coordinates and metadata")
public class FormFieldWithCoordinates {

    @Schema(description = "Fully qualified field name", example = "form1.firstName")
    private String name;

    @Schema(description = "Display label for the field", example = "First Name")
    private String label;

    @Schema(description = "Field type: text, checkbox, radio, combobox, listbox, button, signature")
    private String type;

    @Schema(description = "Current field value")
    private String value;

    @Schema(
            description =
                    "Available options (export values) for choice fields"
                            + " (dropdown, radio, listbox)")
    private List<String> options;

    @Schema(
            description =
                    "Human-readable display labels for choice field options,"
                            + " parallel to the 'options' list. Null when identical to options.")
    private List<String> displayOptions;

    @Schema(description = "Whether the field is required")
    private boolean required;

    @Schema(description = "Whether the field is read-only")
    private boolean readOnly;

    @Schema(description = "Whether this is a multi-select list box")
    private boolean multiSelect;

    @Schema(description = "Whether this is a multi-line text field")
    private boolean multiline;

    @Schema(description = "Tooltip/alternate name for the field")
    private String tooltip;

    @Schema(description = "Widget coordinates on each page (fields can have multiple widgets)")
    private List<WidgetCoordinates> widgets;

    /**
     * Coordinates for a single widget annotation (visual representation of the field). A field can
     * have multiple widgets if it appears on multiple pages.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    @Schema(description = "Widget coordinates in PDF space")
    public static class WidgetCoordinates {

        @Schema(description = "Page index (0-based)", example = "0")
        private int pageIndex;

        @Schema(description = "X coordinate in PDF points (lower-left origin)")
        private float x;

        @Schema(description = "Y coordinate in PDF points (lower-left origin)")
        private float y;

        @Schema(description = "Width in PDF points")
        private float width;

        @Schema(description = "Height in PDF points")
        private float height;

        @Schema(description = "Export value for this widget (radio/checkbox buttons only)")
        private String exportValue;

        @Schema(description = "Font size in PDF points")
        private Float fontSize;

        @Schema(description = "CropBox height in PDF points (used for Y-flip)")
        private Float cropBoxHeight;
    }
}
