package stirling.software.common.util;

import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;

/** Decodes PDF text strings, including the PDF 2.0 UTF-8 form PDFBox 3.0 does not recognise. */
public final class PdfTextStrings {

    private PdfTextStrings() {}

    public static String decode(COSString value) {
        if (value == null) {
            return null;
        }
        byte[] bytes = value.getBytes();
        if (bytes.length >= 3
                && bytes[0] == (byte) 0xEF
                && bytes[1] == (byte) 0xBB
                && bytes[2] == (byte) 0xBF) {
            return new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
        }
        return value.getString();
    }

    /**
     * Returns the decoded text string at {@code key}, or null when it is absent or not a string.
     */
    public static String decode(COSDictionary dictionary, COSName key) {
        COSBase item = dictionary == null ? null : dictionary.getDictionaryObject(key);
        return item instanceof COSString text ? decode(text) : null;
    }
}
