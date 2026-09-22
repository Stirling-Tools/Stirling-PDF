package stirling.software.common.util;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

public enum OfficeDocumentFamily {
    ZIP_PACKAGE,
    FLAT_XML,
    RTF,
    HTML,
    OLE2,
    PDF,
    UNKNOWN;

    private static final byte[] ZIP_MAGIC = {0x50, 0x4B, 0x03, 0x04};
    private static final byte[] ZIP_EMPTY_MAGIC = {0x50, 0x4B, 0x05, 0x06};
    private static final byte[] ZIP_SPANNED_MAGIC = {0x50, 0x4B, 0x07, 0x08};
    private static final byte[] OLE2_MAGIC = {
        (byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1
    };
    private static final byte[] RTF_MAGIC = {0x7B, 0x5C, 0x72, 0x74, 0x66};
    private static final byte[] PDF_MAGIC = {0x25, 0x50, 0x44, 0x46, 0x2D};

    private static final int SNIFF_LENGTH = 4096;

    public static OfficeDocumentFamily detect(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            return UNKNOWN;
        }
        if (startsWith(bytes, ZIP_MAGIC)
                || startsWith(bytes, ZIP_EMPTY_MAGIC)
                || startsWith(bytes, ZIP_SPANNED_MAGIC)) {
            return ZIP_PACKAGE;
        }
        if (startsWith(bytes, OLE2_MAGIC)) {
            return OLE2;
        }
        if (startsWith(bytes, PDF_MAGIC)) {
            return PDF;
        }
        if (startsWithSkippingWhitespace(bytes, RTF_MAGIC)) {
            return RTF;
        }

        String head = head(bytes);
        if (head.isEmpty()) {
            return UNKNOWN;
        }
        if (head.contains("<office:document") || head.contains("opendocument")) {
            return FLAT_XML;
        }
        if (head.contains("<html") || head.contains("<!doctype html") || head.contains("<body")) {
            return HTML;
        }
        if (head.startsWith("<?xml") || head.startsWith("<")) {
            return FLAT_XML;
        }
        return UNKNOWN;
    }

    private static boolean startsWith(byte[] bytes, byte[] magic) {
        if (bytes.length < magic.length) {
            return false;
        }
        for (int i = 0; i < magic.length; i++) {
            if (bytes[i] != magic[i]) {
                return false;
            }
        }
        return true;
    }

    private static boolean startsWithSkippingWhitespace(byte[] bytes, byte[] magic) {
        int offset = 0;
        while (offset < bytes.length && offset < 16 && isWhitespace(bytes[offset])) {
            offset++;
        }
        if (bytes.length - offset < magic.length) {
            return false;
        }
        for (int i = 0; i < magic.length; i++) {
            if (bytes[offset + i] != magic[i]) {
                return false;
            }
        }
        return true;
    }

    private static boolean isWhitespace(byte value) {
        return value == ' ' || value == '\t' || value == '\r' || value == '\n' || value == 0x0B;
    }

    private static String head(byte[] bytes) {
        int length = Math.min(bytes.length, SNIFF_LENGTH);
        int start = 0;
        if (length >= 3
                && (bytes[0] & 0xFF) == 0xEF
                && (bytes[1] & 0xFF) == 0xBB
                && (bytes[2] & 0xFF) == 0xBF) {
            start = 3;
        }
        return new String(bytes, start, length - start, StandardCharsets.UTF_8)
                .toLowerCase(Locale.ROOT)
                .trim();
    }
}
