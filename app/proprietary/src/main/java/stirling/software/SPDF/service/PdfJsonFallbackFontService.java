package stirling.software.SPDF.service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.json.PdfJsonFont;

@Slf4j
@Component
@RequiredArgsConstructor
public class PdfJsonFallbackFontService {

    public static final String FALLBACK_FONT_ID = "fallback-noto-sans";
    public static final String DEFAULT_FALLBACK_FONT_LOCATION =
            "classpath:/static/fonts/NotoSans-Regular.ttf";
    public static final String FALLBACK_FONT_CJK_ID = "fallback-noto-cjk";
    public static final String FALLBACK_FONT_JP_ID = "fallback-noto-jp";
    public static final String FALLBACK_FONT_KR_ID = "fallback-noto-korean";
    public static final String FALLBACK_FONT_AR_ID = "fallback-noto-arabic";
    public static final String FALLBACK_FONT_TH_ID = "fallback-noto-thai";

    private static final Map<String, FallbackFontSpec> BUILT_IN_FALLBACK_FONTS =
            Map.ofEntries(
                    Map.entry(
                            FALLBACK_FONT_CJK_ID,
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSansSC-Regular.ttf",
                                    "NotoSansSC-Regular",
                                    "ttf")),
                    Map.entry(
                            FALLBACK_FONT_JP_ID,
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSansJP-Regular.ttf",
                                    "NotoSansJP-Regular",
                                    "ttf")),
                    Map.entry(
                            FALLBACK_FONT_KR_ID,
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/malgun.ttf", "MalgunGothic", "ttf")),
                    Map.entry(
                            FALLBACK_FONT_AR_ID,
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSansArabic-Regular.ttf",
                                    "NotoSansArabic-Regular",
                                    "ttf")),
                    Map.entry(
                            FALLBACK_FONT_TH_ID,
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSansThai-Regular.ttf",
                                    "NotoSansThai-Regular",
                                    "ttf")));

    private final ResourceLoader resourceLoader;

    @Value("${stirling.pdf.fallback-font:" + DEFAULT_FALLBACK_FONT_LOCATION + "}")
    private String fallbackFontLocation;

    private final Map<String, byte[]> fallbackFontCache = new ConcurrentHashMap<>();

    public PdfJsonFont buildFallbackFontModel() throws IOException {
        return buildFallbackFontModel(FALLBACK_FONT_ID);
    }

    public PdfJsonFont buildFallbackFontModel(String fallbackId) throws IOException {
        FallbackFontSpec spec = getFallbackFontSpec(fallbackId);
        if (spec == null) {
            throw new IOException("Unknown fallback font id " + fallbackId);
        }
        byte[] bytes = loadFallbackFontBytes(fallbackId, spec);
        String base64 = java.util.Base64.getEncoder().encodeToString(bytes);
        return PdfJsonFont.builder()
                .id(fallbackId)
                .uid(fallbackId)
                .baseName(spec.baseName())
                .subtype("TrueType")
                .embedded(true)
                .program(base64)
                .programFormat(spec.format())
                .build();
    }

    public PDFont loadFallbackPdfFont(PDDocument document) throws IOException {
        return loadFallbackPdfFont(document, FALLBACK_FONT_ID);
    }

    public PDFont loadFallbackPdfFont(PDDocument document, String fallbackId) throws IOException {
        FallbackFontSpec spec = getFallbackFontSpec(fallbackId);
        if (spec == null) {
            throw new IOException("Unknown fallback font id " + fallbackId);
        }
        byte[] bytes = loadFallbackFontBytes(fallbackId, spec);
        try (InputStream stream = new ByteArrayInputStream(bytes)) {
            return PDType0Font.load(document, stream, true);
        }
    }

    public boolean canEncodeFully(PDFont font, String text) {
        return canEncode(font, text);
    }

    public boolean canEncode(PDFont font, int codePoint) {
        return canEncode(font, new String(Character.toChars(codePoint)));
    }

    public boolean canEncode(PDFont font, String text) {
        if (font == null || text == null || text.isEmpty()) {
            return false;
        }
        if (font instanceof PDType3Font) {
            return false;
        }
        try {
            font.encode(text);
            return true;
        } catch (IOException | IllegalArgumentException | UnsupportedOperationException ex) {
            log.info(
                    "[FONT-DEBUG] Font {} cannot encode text '{}' ({}): {}",
                    font != null ? font.getName() : "null",
                    text,
                    font != null ? font.getClass().getSimpleName() : "null",
                    ex.getMessage());
            return false;
        }
    }

    public String resolveFallbackFontId(int codePoint) {
        Character.UnicodeBlock block = Character.UnicodeBlock.of(codePoint);
        if (block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_B
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_C
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_D
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_E
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_F
                || block == Character.UnicodeBlock.CJK_SYMBOLS_AND_PUNCTUATION
                || block == Character.UnicodeBlock.BOPOMOFO
                || block == Character.UnicodeBlock.BOPOMOFO_EXTENDED
                || block == Character.UnicodeBlock.HALFWIDTH_AND_FULLWIDTH_FORMS) {
            return FALLBACK_FONT_CJK_ID;
        }

        Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
        return switch (script) {
            case HAN -> FALLBACK_FONT_CJK_ID;
            case HIRAGANA, KATAKANA -> FALLBACK_FONT_JP_ID;
            case HANGUL -> FALLBACK_FONT_KR_ID;
            case ARABIC -> FALLBACK_FONT_AR_ID;
            case THAI -> FALLBACK_FONT_TH_ID;
            default -> FALLBACK_FONT_ID;
        };
    }

    public String mapUnsupportedGlyph(int codePoint) {
        return switch (codePoint) {
            case 0x276E -> "<";
            case 0x276F -> ">";
            default -> null;
        };
    }

    private FallbackFontSpec getFallbackFontSpec(String fallbackId) {
        if (FALLBACK_FONT_ID.equals(fallbackId)) {
            String baseName = inferBaseName(fallbackFontLocation, "NotoSans-Regular");
            String format = inferFormat(fallbackFontLocation, "ttf");
            return new FallbackFontSpec(fallbackFontLocation, baseName, format);
        }
        return BUILT_IN_FALLBACK_FONTS.get(fallbackId);
    }

    private byte[] loadFallbackFontBytes(String fallbackId, FallbackFontSpec spec)
            throws IOException {
        if (spec == null) {
            throw new IOException("No fallback font specification for " + fallbackId);
        }
        byte[] cached = fallbackFontCache.get(fallbackId);
        if (cached != null) {
            return cached;
        }
        Resource resource = resourceLoader.getResource(spec.resourceLocation());
        if (!resource.exists()) {
            throw new IOException("Fallback font resource not found at " + spec.resourceLocation());
        }
        try (InputStream inputStream = resource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            inputStream.transferTo(baos);
            byte[] bytes = baos.toByteArray();
            fallbackFontCache.put(fallbackId, bytes);
            return bytes;
        }
    }

    private String inferBaseName(String location, String defaultName) {
        if (location == null || location.isBlank()) {
            return defaultName;
        }
        int slash = location.lastIndexOf('/');
        String fileName = slash >= 0 ? location.substring(slash + 1) : location;
        int dot = fileName.lastIndexOf('.');
        if (dot > 0) {
            fileName = fileName.substring(0, dot);
        }
        return fileName.isEmpty() ? defaultName : fileName;
    }

    private String inferFormat(String location, String defaultFormat) {
        if (location == null || location.isBlank()) {
            return defaultFormat;
        }
        int dot = location.lastIndexOf('.');
        if (dot >= 0 && dot < location.length() - 1) {
            return location.substring(dot + 1).toLowerCase(Locale.ROOT);
        }
        return defaultFormat;
    }

    private record FallbackFontSpec(String resourceLocation, String baseName, String format) {}
}
