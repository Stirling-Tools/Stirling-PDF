package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.junit.jupiter.api.Test;

class PdfTextStringsTest {

    private static final String BOM = String.valueOf((char) 0xFEFF);

    private static COSString utf8WithBom(String text) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(new byte[] {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF});
        out.writeBytes(text.getBytes(StandardCharsets.UTF_8));
        return new COSString(out.toByteArray());
    }

    @Test
    void decodesUtf8WithBom() {
        assertThat(PdfTextStrings.decode(utf8WithBom("UTF8 été ✓"))).isEqualTo("UTF8 été ✓");
    }

    @Test
    void keepsUtf16AndPdfDocEncodedStrings() {
        assertThat(PdfTextStrings.decode(new COSString("été ✓"))).isEqualTo("été ✓");
        assertThat(PdfTextStrings.decode(new COSString("plain"))).isEqualTo("plain");
    }

    @Test
    void stripsLeadingByteOrderMark() {
        byte[] utf16 = (BOM + BOM + "hi").getBytes(StandardCharsets.UTF_16BE);
        assertThat(PdfTextStrings.decode(new COSString(utf16))).isEqualTo("hi");
    }

    @Test
    void readsDictionaryEntries() {
        COSDictionary dict = new COSDictionary();
        dict.setItem(COSName.TITLE, utf8WithBom("Café"));
        dict.setItem(COSName.COUNT, COSInteger.ONE);
        assertThat(PdfTextStrings.decode(dict, COSName.TITLE)).isEqualTo("Café");
        assertThat(PdfTextStrings.decode(dict, COSName.COUNT)).isNull();
        assertThat(PdfTextStrings.decode(dict, COSName.AUTHOR)).isNull();
        assertThat(PdfTextStrings.decode((COSString) null)).isNull();
    }
}
