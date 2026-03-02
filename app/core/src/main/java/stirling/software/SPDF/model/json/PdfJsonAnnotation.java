package stirling.software.SPDF.model.json;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Represents a PDF annotation (comments, highlights, stamps, etc.). Annotations often contain OCR
 * text layers or other metadata not visible in content streams.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PdfJsonAnnotation {

    /** Annotation subtype (Text, Highlight, Link, Stamp, Widget, etc.) */
    private String subtype;

    /** Human-readable text content of the annotation */
    private String contents;

    /** Annotation rectangle [x1, y1, x2, y2] */
    private float[] rect;

    /** Annotation appearance characteristics */
    private String appearanceState;

    /** Color components (e.g., [r, g, b] for RGB) */
    private float[] color;

    /** Annotation flags (print, hidden, etc.) */
    private Integer flags;

    /** For link annotations: destination or action */
    private String destination;

    /** For text annotations: icon name */
    private String iconName;

    /** Subject/title of the annotation */
    private String subject;

    /** Author of the annotation */
    private String author;

    /** Creation date (ISO 8601 format) */
    private String creationDate;

    /** Modification date (ISO 8601 format) */
    private String modificationDate;

    /** Full annotation dictionary for lossless round-tripping */
    private PdfJsonCosValue rawData;
}
