package stirling.software.SPDF.service.pdfjson.type3;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.apache.pdfbox.pdmodel.font.encoding.Encoding;
import org.apache.pdfbox.util.Matrix;
import org.junit.jupiter.api.Test;

class Type3FontSignatureCalculatorTest {

    @Test
    void computeSignature_nullFont_returnsNull() throws IOException {
        assertNull(Type3FontSignatureCalculator.computeSignature(null));
    }

    @Test
    void computeSignature_returnsHashWithSha256Prefix() throws IOException {
        PDType3Font font = mockMinimalFont();
        String signature = Type3FontSignatureCalculator.computeSignature(font);
        assertNotNull(signature);
        assertTrue(signature.startsWith("sha256:"), "Signature should start with sha256:");
    }

    @Test
    void computeSignature_deterministic() throws IOException {
        PDType3Font font = mockMinimalFont();
        String sig1 = Type3FontSignatureCalculator.computeSignature(font);
        String sig2 = Type3FontSignatureCalculator.computeSignature(font);
        assertEquals(sig1, sig2, "Same font should produce same signature");
    }

    @Test
    void computeSignature_hexLength() throws IOException {
        PDType3Font font = mockMinimalFont();
        String signature = Type3FontSignatureCalculator.computeSignature(font);
        // sha256: prefix + 64 hex chars
        String hex = signature.substring("sha256:".length());
        assertEquals(64, hex.length(), "SHA-256 hash should be 64 hex characters");
        assertTrue(hex.matches("[0-9a-f]+"), "Hex should be lowercase hex");
    }

    @Test
    void computeSignature_noEncoding() throws IOException {
        PDType3Font font = mockMinimalFont();
        when(font.getEncoding()).thenReturn(null);
        String signature = Type3FontSignatureCalculator.computeSignature(font);
        assertNotNull(signature);
        assertTrue(signature.startsWith("sha256:"));
    }

    @Test
    void computeSignature_noCharProcs() throws IOException {
        PDType3Font font = mockMinimalFont();
        COSDictionary cosDict = font.getCOSObject();
        when(cosDict.getDictionaryObject(COSName.CHAR_PROCS)).thenReturn(null);
        String signature = Type3FontSignatureCalculator.computeSignature(font);
        assertNotNull(signature);
    }

    @Test
    void computeSignature_emptyCharProcs() throws IOException {
        PDType3Font font = mockMinimalFont();
        COSDictionary charProcs = new COSDictionary();
        COSDictionary cosDict = font.getCOSObject();
        when(cosDict.getDictionaryObject(COSName.CHAR_PROCS)).thenReturn(charProcs);
        String signature = Type3FontSignatureCalculator.computeSignature(font);
        assertNotNull(signature);
    }

    @Test
    void computeSignature_withCharProcsStream() throws Exception {
        PDType3Font font = mockMinimalFont();
        COSDictionary cosDict = font.getCOSObject();
        COSDictionary charProcs = new COSDictionary();

        COSStream stream = new COSStream();
        try (java.io.OutputStream os = stream.createOutputStream()) {
            os.write(new byte[] {0x01, 0x02, 0x03});
        }

        COSName glyphName = COSName.getPDFName("A");
        charProcs.setItem(glyphName, stream);
        when(cosDict.getDictionaryObject(COSName.CHAR_PROCS)).thenReturn(charProcs);

        Encoding encoding = mock(Encoding.class);
        when(encoding.getName(65)).thenReturn("A");
        when(font.getEncoding()).thenReturn(encoding);
        when(font.getWidthFromFont(65)).thenReturn(600f);

        String signature = Type3FontSignatureCalculator.computeSignature(font);
        assertNotNull(signature);
        assertTrue(signature.startsWith("sha256:"));
    }

    @Test
    void computeSignature_nullMatrix() throws IOException {
        PDType3Font font = mockMinimalFont();
        when(font.getFontMatrix()).thenReturn(null);
        String signature = Type3FontSignatureCalculator.computeSignature(font);
        assertNotNull(signature);
    }

    @Test
    void computeSignature_nullBBox() throws IOException {
        PDType3Font font = mockMinimalFont();
        when(font.getFontBBox()).thenReturn(null);
        String signature = Type3FontSignatureCalculator.computeSignature(font);
        assertNotNull(signature);
    }

    private PDType3Font mockMinimalFont() {
        PDType3Font font = mock(PDType3Font.class);
        COSDictionary cosDict = mock(COSDictionary.class);
        when(font.getCOSObject()).thenReturn(cosDict);
        when(font.getFontMatrix()).thenReturn(new Matrix());
        when(font.getFontBBox()).thenReturn(new PDRectangle());
        when(cosDict.getDictionaryObject(COSName.CHAR_PROCS)).thenReturn(null);

        Encoding encoding = mock(Encoding.class);
        when(font.getEncoding()).thenReturn(encoding);
        return font;
    }
}
