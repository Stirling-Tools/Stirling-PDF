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
public class PdfJsonFontConversionCandidate {

    /** Stable identifier for the strategy that produced this candidate. */
    private String strategyId;

    /** Human-readable label for diagnostics and UI toggles. */
    private String strategyLabel;

    /** Outcome of the conversion attempt. */
    private PdfJsonFontConversionStatus status;

    /** Summary diagnostics or error details. */
    private String message;

    /** Count of glyphs successfully synthesized. */
    private Integer synthesizedGlyphs;

    /** Count of glyphs that could not be reproduced accurately. */
    private Integer missingGlyphs;

    /** Approximate width delta (in glyph units) across the test sample. */
    private Double widthDelta;

    /** Approximate bounding box delta (in glyph units). */
    private Double bboxDelta;

    /** Base64-encoded font program (typically TTF/OTF) produced by the strategy. */
    private String program;

    /** Format hint for {@link #program}. */
    private String programFormat;

    /** Web-optimized payload (e.g. TTF) for browser preview. */
    private String webProgram;

    /** Format for the web payload. */
    private String webProgramFormat;

    /** PDF-friendly payload for re-embedding during export. */
    private String pdfProgram;

    /** Format for the PDF payload. */
    private String pdfProgramFormat;

    /** Optional PNG preview of rendered glyphs (Base64). */
    private String previewImage;

    /** Additional structured diagnostics (JSON string). */
    private String diagnostics;

    /** Known unicode/codepoint coverage derived from the conversion strategy. */
    private int[] glyphCoverage;
}
