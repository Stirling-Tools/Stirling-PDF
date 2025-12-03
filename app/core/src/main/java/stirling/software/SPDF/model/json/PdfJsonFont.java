package stirling.software.SPDF.model.json;

import java.util.List;

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

    /** Web-optimized font program (e.g. converted TrueType) encoded as Base64. */
    private String webProgram;

    /** Format hint for the webProgram payload. */
    private String webProgramFormat;

    /** PDF-friendly font program (e.g. converted TrueType) encoded as Base64. */
    private String pdfProgram;

    /** Format hint for the pdfProgram payload. */
    private String pdfProgramFormat;

    /** Glyph metadata for Type3 fonts to enable precise text rewrites. */
    private List<PdfJsonFontType3Glyph> type3Glyphs;

    /** Per-strategy synthesized font payloads for Type3 normalization. */
    private List<PdfJsonFontConversionCandidate> conversionCandidates;

    /** ToUnicode stream encoded as Base64 when present. */
    private String toUnicode;

    /** Mapped Standard 14 font name when available. */
    private String standard14Name;

    /** Font descriptor flags copied from the source document. */
    private Integer fontDescriptorFlags;

    /** Font ascent in glyph units (typically 1/1000). */
    private Float ascent;

    /** Font descent in glyph units (typically negative). */
    private Float descent;

    /** Capital height when available. */
    private Float capHeight;

    /** x-height when available. */
    private Float xHeight;

    /** Italic angle reported by the font descriptor. */
    private Float italicAngle;

    /** Units per em extracted from the font matrix. */
    private Integer unitsPerEm;

    /** Serialized COS dictionary describing the original font resource. */
    private PdfJsonCosValue cosDictionary;
}
