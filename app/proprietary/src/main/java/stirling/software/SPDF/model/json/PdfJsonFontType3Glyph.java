package stirling.software.SPDF.model.json;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PdfJsonFontType3Glyph {
    /** Character code used in the content stream to reference this glyph. */
    private Integer charCode;

    /** PostScript glyph name, when available. */
    private String glyphName;

    /** Unicode code point represented by this glyph, if it can be resolved. */
    private Integer unicode;

    /** Raw char code used in the Type3 font encoding (0-255). */
    private Integer charCodeRaw;
}
