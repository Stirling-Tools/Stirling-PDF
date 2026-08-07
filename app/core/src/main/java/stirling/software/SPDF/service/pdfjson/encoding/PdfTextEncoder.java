/**
 * Responsible for text encoding behavior used by the PDF JSON conversion workflow.
 *
 * <p>This class is intentionally empty for now. It exists to own the text encoding package and to
 * provide a stable extension point for future extraction of PDF text encoding logic.
 */
package stirling.software.SPDF.service.pdfjson.encoding;

import java.io.ByteArrayOutputStream;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class PdfTextEncoder {

    private static final Logger log = LoggerFactory.getLogger(PdfTextEncoder.class);

    /** Remove control bytes from encoded PDF text sequences while preserving valid whitespace. */
    public static byte[] sanitizeEncoded(byte[] encoded) {
        if (encoded == null || encoded.length == 0) {
            return new byte[0];
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream(encoded.length);
        for (byte b : encoded) {
            if (isStrippedControlByte(b)) {
                continue;
            }
            baos.write(b);
        }
        byte[] sanitized = baos.toByteArray();
        if (sanitized.length == 0) {
            return sanitized;
        }
        return sanitized;
    }

    /** Returns true for control bytes that should be stripped from PDF text streams. */
    public static boolean isStrippedControlByte(byte value) {
        if (value == 0) {
            return true;
        }
        int unsigned = Byte.toUnsignedInt(value);
        if (unsigned <= 0x1F) {
            return !(unsigned == 0x09 || unsigned == 0x0A || unsigned == 0x0D);
        }
        return false;
    }

    public static byte[] encodeType3CharCodes(List<Integer> charCodes) {
        if (charCodes == null || charCodes.isEmpty()) {
            return null;
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream(charCodes.size());
        for (Integer code : charCodes) {
            if (code == null || code < 0 || code > 0xFF) {
                return null;
            }
            baos.write(code);
        }
        return baos.toByteArray();
    }
}
