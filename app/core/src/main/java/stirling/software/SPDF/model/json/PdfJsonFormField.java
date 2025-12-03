package stirling.software.SPDF.model.json;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Represents a PDF form field (AcroForm). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PdfJsonFormField {

    /** Fully qualified field name (e.g., "form1.textfield1") */
    private String name;

    /** Partial field name (last component) */
    private String partialName;

    /** Field type (Tx=text, Btn=button, Ch=choice, Sig=signature) */
    private String fieldType;

    /** Field value as string */
    private String value;

    /** Default value */
    private String defaultValue;

    /** Field flags (readonly, required, multiline, etc.) */
    private Integer flags;

    /** Alternative field name (for accessibility) */
    private String alternateFieldName;

    /** Mapping name (for export) */
    private String mappingName;

    /** Page number where field appears (1-indexed) */
    private Integer pageNumber;

    /** Field rectangle [x1, y1, x2, y2] on the page */
    private List<Float> rect;

    /** For choice fields: list of options */
    private List<String> options;

    /** For choice fields: selected indices */
    private List<Integer> selectedIndices;

    /** For button fields: whether it's checked */
    private Boolean checked;

    /** Font information for text fields */
    private String fontName;

    private Float fontSize;

    /** Full field dictionary for lossless round-tripping */
    private PdfJsonCosValue rawData;
}
