package stirling.software.SPDF.service;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;

import org.apache.fontbox.ttf.HeaderTable;
import org.apache.fontbox.ttf.NameRecord;
import org.apache.fontbox.ttf.NamingTable;
import org.apache.fontbox.ttf.OS2WindowsMetricsTable;
import org.apache.fontbox.ttf.OTFParser;
import org.apache.fontbox.ttf.OpenTypeFont;
import org.apache.fontbox.ttf.TrueTypeFont;
import org.apache.pdfbox.io.RandomAccessRead;
import org.apache.pdfbox.io.RandomAccessReadBuffer;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.EditorFontRegistry.EditorFontFace;

@Slf4j
final class EditorFontReader {

    private static final int FS_TYPE_USAGE_MASK = 0x000F;
    private static final int FS_TYPE_RESTRICTED = 0x0002;
    private static final int FS_TYPE_BITMAP_ONLY = 0x0200;
    private static final int FS_SELECTION_ITALIC = 0x0001;
    private static final int FS_SELECTION_BOLD = 0x0020;
    private static final int FS_SELECTION_OBLIQUE = 0x0200;
    private static final int MAC_STYLE_BOLD = 0x0001;
    private static final int MAC_STYLE_ITALIC = 0x0002;
    private static final int NAME_TYPOGRAPHIC_FAMILY = 16;
    private static final int NAME_TYPOGRAPHIC_SUBFAMILY = 17;
    private static final int WEIGHT_REGULAR = 400;
    private static final int WEIGHT_SEMIBOLD = 600;
    private static final int WEIGHT_BOLD = 700;

    private static final List<String> UNSUPPORTED_EXTENSIONS =
            List.of(".ttc", ".otc", ".woff", ".woff2");

    record ReadFace(String family, EditorFontFace face) {}

    private EditorFontReader() {}

    static String formatOf(String filename) {
        String name = filename.toLowerCase(Locale.ROOT);
        if (name.endsWith(".ttf")) return "ttf";
        if (name.endsWith(".otf")) return "otf";
        return null;
    }

    static boolean isUnsupported(String filename) {
        String name = filename.toLowerCase(Locale.ROOT);
        return UNSUPPORTED_EXTENSIONS.stream().anyMatch(name::endsWith);
    }

    static ReadFace read(byte[] bytes, String format, Object source) {
        try (RandomAccessRead in = new RandomAccessReadBuffer(bytes);
                TrueTypeFont font = new OTFParser().parse(in)) {
            String unusable = whyUnusable(font);
            if (unusable != null) {
                log.info("Skipping editor font {}: {}", source, unusable);
                return null;
            }
            NamingTable naming = font.getNaming();
            String family =
                    firstNonBlank(
                            name(naming, NAME_TYPOGRAPHIC_FAMILY),
                            naming == null ? null : naming.getFontFamily());
            if (family == null) {
                log.info("Skipping editor font {}: no family name", source);
                return null;
            }
            OS2WindowsMetricsTable os2 = font.getOS2Windows();
            HeaderTable header = font.getHeader();
            int macStyle = header == null ? 0 : header.getMacStyle();
            int fsSelection = os2 == null ? 0 : os2.getFsSelection();
            int weightClass = os2 == null ? 0 : os2.getWeightClass();
            boolean bold;
            int weight;
            if (weightClass > 0) {
                bold = weightClass >= WEIGHT_SEMIBOLD;
                weight = weightClass;
            } else {
                bold = (macStyle & MAC_STYLE_BOLD) != 0 || (fsSelection & FS_SELECTION_BOLD) != 0;
                weight = bold ? WEIGHT_BOLD : WEIGHT_REGULAR;
            }
            boolean italic =
                    (fsSelection & (FS_SELECTION_ITALIC | FS_SELECTION_OBLIQUE)) != 0
                            || (macStyle & MAC_STYLE_ITALIC) != 0;
            EditorFontFace face =
                    new EditorFontFace(
                            sha256(bytes),
                            firstNonBlank(
                                    name(naming, NAME_TYPOGRAPHIC_SUBFAMILY),
                                    naming.getFontSubFamily(),
                                    "Regular"),
                            bold,
                            italic,
                            weight,
                            firstNonBlank(naming.getPostScriptName(), ""),
                            format,
                            bytes.length);
            return new ReadFace(family, face);
        } catch (IOException | RuntimeException e) {
            log.warn("Skipping editor font {}: {}", source, e.getMessage());
            return null;
        }
    }

    private static String whyUnusable(TrueTypeFont font) throws IOException {
        if (font instanceof OpenTypeFont otf && otf.isPostScript()) {
            return "CFF outlines cannot be embedded as TrueType";
        }
        if (font.getTableMap().containsKey("fvar")) {
            return "variable fonts embed only their default instance";
        }
        OS2WindowsMetricsTable os2 = font.getOS2Windows();
        int fsType = os2 == null ? 0 : os2.getFsType() & 0xFFFF;
        if ((fsType & FS_TYPE_USAGE_MASK) == FS_TYPE_RESTRICTED
                || (fsType & FS_TYPE_BITMAP_ONLY) != 0) {
            return "its licence forbids embedding (fsType " + fsType + ")";
        }
        return null;
    }

    private static String name(NamingTable naming, int nameId) {
        if (naming == null) return null;
        String fallback = null;
        for (NameRecord record : naming.getNameRecords()) {
            if (record.getNameId() != nameId) continue;
            String value = record.getString();
            if (value == null || value.isBlank()) continue;
            if (record.getPlatformId() == NameRecord.PLATFORM_WINDOWS
                    && record.getLanguageId() == NameRecord.LANGUAGE_WINDOWS_EN_US) {
                return value.trim();
            }
            if (fallback == null) fallback = value.trim();
        }
        return fallback;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return null;
    }

    static String sha256(byte[] bytes) {
        return HexFormat.of().formatHex(newDigest().digest(bytes));
    }

    static MessageDigest newDigest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
