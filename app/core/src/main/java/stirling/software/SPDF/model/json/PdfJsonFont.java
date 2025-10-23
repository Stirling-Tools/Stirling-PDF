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
public class PdfJsonFont {

    /** PDF resource name (e.g. F1) used as the primary identifier. */
    private String id;

    /** Logical page number that owns this font resource. */
    private Integer pageNumber;

    /** Stable UID combining page number and resource for diagnostics. */
    private String uid;

    /** Reported PostScript/Base font name. */
    private String baseName;

    /** Declared subtype in the COS dictionary. */
    private String subtype;

    /** Encoding dictionary or name. */
    private String encoding;

    /** CID system info for Type0 fonts. */
    private PdfJsonFontCidSystemInfo cidSystemInfo;

    /** True when the original PDF embedded the font program. */
    private Boolean embedded;

    /** Font program bytes (TTF/OTF/CFF/PFB) encoded as Base64. */
    private String program;

    /** Hint describing the font program type (ttf, otf, cff, pfb, etc.). */
    private String programFormat;

    /** ToUnicode stream encoded as Base64 when present. */
    private String toUnicode;

    /** Mapped Standard 14 font name when available. */
    private String standard14Name;

    /** Font descriptor flags copied from the source document. */
    private Integer fontDescriptorFlags;
}
