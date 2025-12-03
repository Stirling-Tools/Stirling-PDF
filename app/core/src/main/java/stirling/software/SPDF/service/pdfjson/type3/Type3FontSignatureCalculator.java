package stirling.software.SPDF.service.pdfjson.type3;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSNumber;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType3CharProc;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.apache.pdfbox.pdmodel.font.encoding.Encoding;
import org.apache.pdfbox.util.Matrix;

/**
 * Computes a reproducible hash for Type3 fonts so we can match them against a pre-built library of
 * converted programs. The signature intentionally combines multiple aspects of the font (encoding,
 * CharProc streams, glyph widths, font metrics) to minimise collisions between unrelated fonts that
 * coincidentally share glyph names.
 */
public final class Type3FontSignatureCalculator {

    private Type3FontSignatureCalculator() {}

    public static String computeSignature(PDType3Font font) throws IOException {
        if (font == null) {
            return null;
        }
        MessageDigest digest = newDigest();
        updateMatrix(digest, font.getFontMatrix());
        updateRectangle(digest, font.getFontBBox());
        updateEncoding(digest, font.getEncoding());
        updateCharProcs(digest, font);
        byte[] hash = digest.digest();
        return "sha256:" + toHex(hash);
    }

    private static void updateEncoding(MessageDigest digest, Encoding encoding) {
        if (encoding == null) {
            updateInt(digest, -1);
            return;
        }
        for (int code = 0; code <= 0xFF; code++) {
            String name = encoding.getName(code);
            if (name != null) {
                updateInt(digest, code);
                updateString(digest, name);
            }
        }
    }

    private static void updateCharProcs(MessageDigest digest, PDType3Font font) throws IOException {
        COSDictionary charProcs =
                (COSDictionary) font.getCOSObject().getDictionaryObject(COSName.CHAR_PROCS);
        if (charProcs == null || charProcs.size() == 0) {
            updateInt(digest, 0);
            return;
        }
        List<COSName> glyphNames = new ArrayList<>(charProcs.keySet());
        glyphNames.sort(Comparator.comparing(COSName::getName, String.CASE_INSENSITIVE_ORDER));
        for (COSName glyphName : glyphNames) {
            updateString(digest, glyphName.getName());
            int code = resolveCharCode(font, glyphName.getName());
            updateInt(digest, code);
            if (code >= 0) {
                try {
                    updateFloat(digest, font.getWidthFromFont(code));
                } catch (IOException ignored) {
                    updateFloat(digest, 0f);
                }
            } else {
                updateFloat(digest, 0f);
            }

            COSStream stream =
                    charProcs.getDictionaryObject(glyphName) instanceof COSStream cosStream
                            ? cosStream
                            : null;
            if (stream != null) {
                byte[] payload = readAllBytes(stream);
                updateInt(digest, payload.length);
                digest.update(payload);
                PDType3CharProc charProc = new PDType3CharProc(font, stream);
                updateRectangle(digest, extractGlyphBoundingBox(font, charProc));
            } else {
                updateInt(digest, -1);
            }
        }
        updateInt(digest, glyphNames.size());
    }

    private static byte[] readAllBytes(COSStream stream) throws IOException {
        try (InputStream inputStream = stream.createInputStream()) {
            return inputStream.readAllBytes();
        }
    }

    private static COSArray extractGlyphBoundingBox(PDType3Font font, PDType3CharProc charProc) {
        if (charProc == null) {
            return null;
        }
        COSStream stream = charProc.getCOSObject();
        if (stream != null) {
            COSArray bboxArray = (COSArray) stream.getDictionaryObject(COSName.BBOX);
            if (bboxArray != null && bboxArray.size() == 4) {
                return bboxArray;
            }
        }
        return font.getCOSObject().getCOSArray(COSName.BBOX);
    }

    private static int resolveCharCode(PDType3Font font, String glyphName) {
        if (glyphName == null || font.getEncoding() == null) {
            return -1;
        }
        Encoding encoding = font.getEncoding();
        for (int code = 0; code <= 0xFF; code++) {
            String name = encoding.getName(code);
            if (glyphName.equals(name)) {
                return code;
            }
        }
        return -1;
    }

    private static void updateMatrix(MessageDigest digest, Matrix matrix) {
        if (matrix == null) {
            updateInt(digest, -1);
            return;
        }
        float[][] values = matrix.getValues();
        updateInt(digest, values.length);
        for (float[] row : values) {
            if (row == null) {
                updateInt(digest, -1);
                continue;
            }
            updateInt(digest, row.length);
            for (float value : row) {
                updateFloat(digest, value);
            }
        }
    }

    private static void updateRectangle(MessageDigest digest, PDRectangle rectangle) {
        if (rectangle == null) {
            updateInt(digest, -1);
            return;
        }
        updateFloat(digest, rectangle.getLowerLeftX());
        updateFloat(digest, rectangle.getLowerLeftY());
        updateFloat(digest, rectangle.getUpperRightX());
        updateFloat(digest, rectangle.getUpperRightY());
    }

    private static void updateRectangle(MessageDigest digest, COSArray array) {
        if (array == null) {
            updateInt(digest, -1);
            return;
        }
        updateInt(digest, array.size());
        for (int i = 0; i < array.size(); i++) {
            COSBase value = array.getObject(i);
            if (value instanceof COSNumber number) {
                updateFloat(digest, number.floatValue());
            } else {
                updateFloat(digest, 0f);
            }
        }
    }

    private static void updateString(MessageDigest digest, String value) {
        if (value == null) {
            updateInt(digest, -1);
            return;
        }
        byte[] bytes = value.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        updateInt(digest, bytes.length);
        digest.update(bytes);
    }

    private static void updateInt(MessageDigest digest, int value) {
        digest.update(ByteBuffer.allocate(Integer.BYTES).putInt(value).array());
    }

    private static void updateFloat(MessageDigest digest, float value) {
        if (Float.isNaN(value) || Float.isInfinite(value)) {
            value = 0f;
        }
        digest.update(ByteBuffer.allocate(Float.BYTES).putFloat(value).array());
    }

    private static MessageDigest newDigest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("Missing SHA-256 MessageDigest", ex);
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format(Locale.ROOT, "%02x", Byte.toUnsignedInt(value)));
        }
        return builder.toString();
    }
}
