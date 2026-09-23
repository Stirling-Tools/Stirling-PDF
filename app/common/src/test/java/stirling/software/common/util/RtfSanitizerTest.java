package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class RtfSanitizerTest {

    private final RtfSanitizer sanitizer = new RtfSanitizer();

    @Test
    void plainTextWithKeywordLikeWordsIsUntouched() {
        String rtf =
                "{\\rtf1\\ansi The linked report will import data. LINK DDE INCLUDEPICTURE"
                        + " are words here.\\par}";

        assertUnchanged(rtf);
    }

    @Test
    void benignFieldsAreUntouched() {
        String rtf =
                "{\\rtf1\\ansi {\\field{\\*\\fldinst { HYPERLINK \"https://example.com/link/import\""
                        + " }}{\\fldrslt {link}}} {\\field{\\*\\fldinst PAGE}{\\fldrslt 1}}}";

        assertUnchanged(rtf);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "{\\rtf1 {\\field{\\*\\fldinst { INCLUDEPICTURE \"/etc/x.png\" }}{\\fldrslt}}}",
                "{\\rtf1 {\\field{\\*\\fldinst INCLUDETEXT \"/configs/settings.yml\"}{\\fldrslt}}}",
                "{\\rtf1 {\\field{\\*\\fldinst includetext \"x\"}{\\fldrslt}}}",
                "{\\rtf1 {\\field{\\*\\fldinst DDEAUTO excel \"a\"}{\\fldrslt}}}",
                "{\\rtf1 {\\field{\\*\\fldinst \"LINK\" Excel.Sheet \"x\"}{\\fldrslt}}}",
                "{\\rtf1 {\\field{\\fldinst IMPORT \"x\"}{\\fldrslt}}}"
            })
    void linkingFieldTypesAreMasked(String rtf) {
        String cleaned = sanitize(rtf);

        assertFalse(
                cleaned.matches("(?is).*\\b(INCLUDEPICTURE|INCLUDETEXT|DDEAUTO|LINK|IMPORT)\\b.*"),
                cleaned);
        assertEquals(rtf.length(), cleaned.length(), "Masking must preserve length");
    }

    @Test
    void hexEscapedFieldTypeIsMasked() {
        String rtf = "{\\rtf1 {\\field{\\*\\fldinst \\'49NCLUDETEXT \"/configs/x\"}{\\fldrslt}}}";

        String cleaned = sanitize(rtf);

        assertFalse(cleaned.contains("\\'49"), cleaned);
        assertFalse(cleaned.contains("NCLUDETEXT"), cleaned);
    }

    @Test
    void unicodeEscapedFieldTypeIsMasked() {
        String rtf = "{\\rtf1 {\\field{\\*\\fldinst \\u73?\\u78\\'4eCLUDETEXT \"/x\"}{\\fldrslt}}}";

        String cleaned = sanitize(rtf);

        assertFalse(cleaned.contains("\\u73"), cleaned);
        assertFalse(cleaned.contains("CLUDETEXT"), cleaned);
    }

    @Test
    void fieldTypeSplitAcrossGroupsAndLineBreaksIsMasked() {
        String rtf =
                "{\\rtf1 {\\field{\\*\\fldinst {\\b INCLU}{DE\r\nTE}\\-XT \"/x\"}{\\fldrslt}}}";

        String cleaned = sanitize(rtf);

        assertFalse(cleaned.contains("INCLU"), cleaned);
        assertFalse(cleaned.contains("TE}"), cleaned);
    }

    @Test
    void fieldTypeSplitAroundIgnoredGroupIsMasked() {
        String rtf =
                "{\\rtf1 {\\field{\\*\\fldinst INCLUDE{\\*\\junk abc}{\\pict 0a0b}TEXT \"/x\"}"
                        + "{\\fldrslt}}}";

        String cleaned = sanitize(rtf);

        assertFalse(cleaned.contains("INCLUDE"), cleaned);
        assertFalse(cleaned.contains("}TEXT"), cleaned);
        assertTrue(cleaned.contains("0a0b"), "Picture data must survive: " + cleaned);
    }

    @Test
    void importerLookaheadThroughIgnorableGroupIsMasked() {
        String rtf =
                "{\\rtf1 {\\field{\\*\\fldinst{\\*\\x INCLUDEPICTURE} \"../../etc/a.png\"}"
                        + "{\\fldrslt}}}";

        String cleaned = sanitize(rtf);

        assertFalse(cleaned.contains("INCLUDEPICTURE"), cleaned);
    }

    @Test
    void importerLookaheadThroughBinaryPayloadIsMasked() {
        String rtf =
                "{\\rtf1 {\\field{\\*\\fldinst\\bin15 INCLUDEPICTURE \"/etc/a.png\"}{\\fldrslt}}}";

        String cleaned = sanitize(rtf);

        assertFalse(cleaned.contains("INCLUDEPICTURE"), cleaned);
    }

    @Test
    void nestedLinkingFieldIsMasked() {
        String rtf =
                "{\\rtf1 {\\field{\\*\\fldinst IF 1 = 1 {\\field{\\*\\fldinst INCLUDETEXT \"/x\"}"
                        + "{\\fldrslt}} \"\"}{\\fldrslt}}}";

        String cleaned = sanitize(rtf);

        assertFalse(cleaned.contains("INCLUDETEXT"), cleaned);
        assertTrue(cleaned.contains("IF 1 = 1"), cleaned);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "\\u00000000073?NCLUDETEXT \"/x\"",
                "\\uc00000002\\u73xyNCLUDETEXT \"/x\"",
                "\\u73\\b ?NCLUDETEXT \"/x\"",
                "\\'4\r\n9NCLUDETEXT \"/x\"",
                "INCLUDE\\foo-TEXT \"/x\"",
                "INCLUDE\\1TEXT \"/x\"",
                "INCLUDETEX\\uc-1\\u84 abc \"/x\"",
                "{\\*\\b INCLU}DETEXT \"/x\"",
                "{\\rtf INCLU}DETEXT \"/x\"",
                "{\\*\\i LI}NK soffice \"/x\" \"\"",
                "\\u73\\b XNCLUDETEXT \"/x\"",
                "INCLUDE{\\pict {TEXT}} \"/x\"",
                "INCLUDE\\'0dTEXT \"/x\"",
                "{\\formfield INCLU}DETEXT \"/x\"",
                "{\\object INCLU}DETEXT \"/x\"",
                "{\\shp DD}EAUTO excel \"a\""
            })
    void fieldTypeSpelledTheWayLibreOfficeLexesIsMasked(String instruction) {
        String rtf = "{\\rtf1 {\\field{\\*\\fldinst " + instruction + "}{\\fldrslt}}}";

        String cleaned = sanitize(rtf);

        assertFalse(cleaned.contains("\\fldinst"), cleaned);
        assertFalse(cleaned.contains("NCLUDE"), cleaned);
    }

    @Test
    void binaryLengthIsReadWithLibreOfficesDigitAndOverflowRules() {
        String field = "{\\field{\\*\\fldinst INCLUDETEXT \"/x\"}{\\fldrslt}}";

        String leadingZeros =
                sanitize("{\\rtf1 {\\*\\foo \\bin00000000014 \\bin999999999 }" + field + "}");
        String overflowing = sanitize("{\\rtf1 {\\*\\foo \\bin4294967296 }" + field + "}");

        assertFalse(leadingZeros.contains("INCLUDETEXT"), leadingZeros);
        assertFalse(overflowing.contains("\\fldinst"), overflowing);
    }

    @Test
    void unknownStarredWordInsideAnInstructionRemovesIt() {
        String rtf =
                "{\\rtf1 {\\field{\\*\\fldinst {\\*\\cs15 INCLUDE}TEXT \"/x\"}" + "{\\fldrslt}}}";

        assertFalse(sanitize(rtf).contains("\\fldinst"));
    }

    @Test
    void unpredictableDocumentsLoseEveryFieldInstruction() {
        String hyperlink = "{\\field{\\*\\fldinst HYPERLINK \"https://example.com\"}{\\fldrslt x}}";
        String shiftJisSwallowsBrace = "{\\rtf1\\ansicpg932 {\\*\\junk \u0081}}" + hyperlink + "}";
        String openHexAtGroupEnd = "{\\rtf1 {\\'4}" + hyperlink + "}";
        String latinHighByte = "{\\rtf1\\ansicpg1252 {\\*\\junk \u0081}}" + hyperlink + "}";

        assertFalse(sanitize(shiftJisSwallowsBrace).contains("\\fldinst"));
        assertFalse(sanitize(openHexAtGroupEnd).contains("\\fldinst"));
        assertUnchanged(latinHighByte);
    }

    @Test
    void objectLinkControlWordsAreMasked() {
        String rtf =
                "{\\rtf1 {\\object\\objautlink\\objupdate{\\*\\objclass Word.Document.8}"
                        + "{\\*\\objdata 0105}{\\result x}}}";

        String cleaned = sanitize(rtf);

        assertFalse(cleaned.contains("\\objautlink"), cleaned);
        assertFalse(cleaned.contains("\\objupdate"), cleaned);
        assertFalse(cleaned.contains("\\objdata"), cleaned);
        assertTrue(cleaned.contains("\\objclass"), cleaned);
        assertTrue(cleaned.contains("\\object"), cleaned);
    }

    @Test
    void binaryPayloadIsNotScannedForObjectWords() {
        byte[] payload = "\\objlink".getBytes(StandardCharsets.US_ASCII);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes("{\\rtf1{\\pict\\bin8 ".getBytes(StandardCharsets.US_ASCII));
        out.writeBytes(payload);
        out.writeBytes("}}".getBytes(StandardCharsets.US_ASCII));
        byte[] input = out.toByteArray();

        assertArrayEquals(input, sanitizer.sanitize(input));
    }

    @Test
    void truncatedDocumentIsStillScanned() {
        String rtf = "{\\rtf1 {\\field{\\*\\fldinst INCLUDETEXT \"/x\"";

        assertFalse(sanitize(rtf).contains("INCLUDETEXT"));
    }

    private String sanitize(String rtf) {
        byte[] cleaned = sanitizer.sanitize(rtf.getBytes(StandardCharsets.ISO_8859_1));
        return new String(cleaned, StandardCharsets.ISO_8859_1);
    }

    private void assertUnchanged(String rtf) {
        assertEquals(rtf, sanitize(rtf));
    }
}
