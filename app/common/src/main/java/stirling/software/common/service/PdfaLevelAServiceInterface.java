package stirling.software.common.service;

import java.util.List;

/**
 * Raises a converted PDF/A file from conformance level B to level A, which needs the tagging the
 * PDF/UA tagger does. Implemented only in the proprietary module; core builds convert at level B.
 */
public interface PdfaLevelAServiceInterface {

    /**
     * @param levelA true only when the file was tagged and validated, so the claim is never a guess
     */
    record Result(byte[] pdfBytes, boolean levelA, List<String> warnings) {}

    /**
     * @param part PDF/A part, 1 to 3; part 1 keeps its PDF 1.4 version
     * @param alsoDeclareUa additionally claim PDF/UA, but only if it validates
     */
    Result upgradeToLevelA(
            byte[] pdfBytes, int part, String language, String title, boolean alsoDeclareUa);
}
