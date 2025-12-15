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
    public static final String FALLBACK_FONT_TC_ID = "fallback-noto-tc";
    public static final String FALLBACK_FONT_AR_ID = "fallback-noto-arabic";
    public static final String FALLBACK_FONT_TH_ID = "fallback-noto-thai";
    public static final String FALLBACK_FONT_DEVANAGARI_ID = "fallback-noto-devanagari";
    public static final String FALLBACK_FONT_MALAYALAM_ID = "fallback-noto-malayalam";
    public static final String FALLBACK_FONT_TIBETAN_ID = "fallback-noto-tibetan";

    // Font name aliases map PDF font names to available fallback fonts
    // This provides better visual consistency when editing PDFs
    private static final Map<String, String> FONT_NAME_ALIASES =
            Map.ofEntries(
                    // Liberation fonts are metric-compatible with Microsoft core fonts
                    Map.entry("arial", "fallback-liberation-sans"),
                    Map.entry("helvetica", "fallback-liberation-sans"),
                    Map.entry("arimo", "fallback-liberation-sans"),
                    Map.entry("liberationsans", "fallback-liberation-sans"),
                    Map.entry("times", "fallback-liberation-serif"),
                    Map.entry("timesnewroman", "fallback-liberation-serif"),
                    Map.entry("tinos", "fallback-liberation-serif"),
                    Map.entry("liberationserif", "fallback-liberation-serif"),
                    Map.entry("courier", "fallback-liberation-mono"),
                    Map.entry("couriernew", "fallback-liberation-mono"),
                    Map.entry("cousine", "fallback-liberation-mono"),
                    Map.entry("liberationmono", "fallback-liberation-mono"),
                    // DejaVu fonts - widely used open source fonts
                    Map.entry("dejavu", "fallback-dejavu-sans"),
                    Map.entry("dejavusans", "fallback-dejavu-sans"),
                    Map.entry("dejavuserif", "fallback-dejavu-serif"),
                    Map.entry("dejavumono", "fallback-dejavu-mono"),
                    Map.entry("dejavusansmono", "fallback-dejavu-mono"),
                    // Traditional Chinese fonts (Taiwan, Hong Kong, Macau)
                    Map.entry("mingliu", "fallback-noto-tc"),
                    Map.entry("pmingliu", "fallback-noto-tc"),
                    Map.entry("microsoftjhenghei", "fallback-noto-tc"),
                    Map.entry("jhenghei", "fallback-noto-tc"),
                    Map.entry("kaiti", "fallback-noto-tc"),
                    Map.entry("kaiu", "fallback-noto-tc"),
                    Map.entry("dfkaib5", "fallback-noto-tc"),
                    Map.entry("dfkai", "fallback-noto-tc"),
                    // Simplified Chinese fonts (Mainland China) - more common
                    Map.entry("simsun", "fallback-noto-cjk"),
                    Map.entry("simhei", "fallback-noto-cjk"),
                    Map.entry("microsoftyahei", "fallback-noto-cjk"),
                    Map.entry("yahei", "fallback-noto-cjk"),
                    Map.entry("songti", "fallback-noto-cjk"),
                    Map.entry("heiti", "fallback-noto-cjk"),
                    // Noto Sans - Google's universal font (use as last resort generic fallback)
                    Map.entry("noto", "fallback-noto-sans"),
                    Map.entry("notosans", "fallback-noto-sans"));

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
                                    "classpath:/static/fonts/NotoSansKR-Regular.ttf",
                                    "NotoSansKR-Regular",
                                    "ttf")),
                    Map.entry(
                            FALLBACK_FONT_TC_ID,
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSansTC-Regular.ttf",
                                    "NotoSansTC-Regular",
                                    "ttf")),
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
                                    "ttf")),
                    Map.entry(
                            FALLBACK_FONT_DEVANAGARI_ID,
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSansDevanagari-Regular.ttf",
                                    "NotoSansDevanagari-Regular",
                                    "ttf")),
                    Map.entry(
                            FALLBACK_FONT_MALAYALAM_ID,
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSansMalayalam-Regular.ttf",
                                    "NotoSansMalayalam-Regular",
                                    "ttf")),
                    Map.entry(
                            FALLBACK_FONT_TIBETAN_ID,
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSerifTibetan-Regular.ttf",
                                    "NotoSerifTibetan-Regular",
                                    "ttf")),
                    // Liberation Sans family
                    Map.entry(
                            "fallback-liberation-sans",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/LiberationSans-Regular.ttf",
                                    "LiberationSans-Regular",
                                    "ttf")),
                    Map.entry(
                            "fallback-liberation-sans-bold",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/LiberationSans-Bold.ttf",
                                    "LiberationSans-Bold",
                                    "ttf")),
                    Map.entry(
                            "fallback-liberation-sans-italic",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/LiberationSans-Italic.ttf",
                                    "LiberationSans-Italic",
                                    "ttf")),
                    Map.entry(
                            "fallback-liberation-sans-bolditalic",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/LiberationSans-BoldItalic.ttf",
                                    "LiberationSans-BoldItalic",
                                    "ttf")),
                    // Liberation Serif family
                    Map.entry(
                            "fallback-liberation-serif",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/LiberationSerif-Regular.ttf",
                                    "LiberationSerif-Regular",
                                    "ttf")),
                    Map.entry(
                            "fallback-liberation-serif-bold",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/LiberationSerif-Bold.ttf",
                                    "LiberationSerif-Bold",
                                    "ttf")),
                    Map.entry(
                            "fallback-liberation-serif-italic",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/LiberationSerif-Italic.ttf",
                                    "LiberationSerif-Italic",
                                    "ttf")),
                    Map.entry(
                            "fallback-liberation-serif-bolditalic",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/LiberationSerif-BoldItalic.ttf",
                                    "LiberationSerif-BoldItalic",
                                    "ttf")),
                    // Liberation Mono family
                    Map.entry(
                            "fallback-liberation-mono",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/LiberationMono-Regular.ttf",
                                    "LiberationMono-Regular",
                                    "ttf")),
                    Map.entry(
                            "fallback-liberation-mono-bold",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/LiberationMono-Bold.ttf",
                                    "LiberationMono-Bold",
                                    "ttf")),
                    Map.entry(
                            "fallback-liberation-mono-italic",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/LiberationMono-Italic.ttf",
                                    "LiberationMono-Italic",
                                    "ttf")),
                    Map.entry(
                            "fallback-liberation-mono-bolditalic",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/LiberationMono-BoldItalic.ttf",
                                    "LiberationMono-BoldItalic",
                                    "ttf")),
                    // Noto Sans family (enhanced with weight variants)
                    Map.entry(
                            FALLBACK_FONT_ID,
                            new FallbackFontSpec(
                                    DEFAULT_FALLBACK_FONT_LOCATION, "NotoSans-Regular", "ttf")),
                    Map.entry(
                            "fallback-noto-sans-bold",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSans-Bold.ttf",
                                    "NotoSans-Bold",
                                    "ttf")),
                    Map.entry(
                            "fallback-noto-sans-italic",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSans-Italic.ttf",
                                    "NotoSans-Italic",
                                    "ttf")),
                    Map.entry(
                            "fallback-noto-sans-bolditalic",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/NotoSans-BoldItalic.ttf",
                                    "NotoSans-BoldItalic",
                                    "ttf")),
                    // DejaVu Sans family
                    Map.entry(
                            "fallback-dejavu-sans",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/DejaVuSans.ttf", "DejaVuSans", "ttf")),
                    Map.entry(
                            "fallback-dejavu-sans-bold",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/DejaVuSans-Bold.ttf",
                                    "DejaVuSans-Bold",
                                    "ttf")),
                    Map.entry(
                            "fallback-dejavu-sans-oblique",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/DejaVuSans-Oblique.ttf",
                                    "DejaVuSans-Oblique",
                                    "ttf")),
                    Map.entry(
                            "fallback-dejavu-sans-boldoblique",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/DejaVuSans-BoldOblique.ttf",
                                    "DejaVuSans-BoldOblique",
                                    "ttf")),
                    // DejaVu Serif family
                    Map.entry(
                            "fallback-dejavu-serif",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/DejaVuSerif.ttf",
                                    "DejaVuSerif",
                                    "ttf")),
                    Map.entry(
                            "fallback-dejavu-serif-bold",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/DejaVuSerif-Bold.ttf",
                                    "DejaVuSerif-Bold",
                                    "ttf")),
                    Map.entry(
                            "fallback-dejavu-serif-italic",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/DejaVuSerif-Italic.ttf",
                                    "DejaVuSerif-Italic",
                                    "ttf")),
                    Map.entry(
                            "fallback-dejavu-serif-bolditalic",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/DejaVuSerif-BoldItalic.ttf",
                                    "DejaVuSerif-BoldItalic",
                                    "ttf")),
                    // DejaVu Mono family
                    Map.entry(
                            "fallback-dejavu-mono",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/DejaVuSansMono.ttf",
                                    "DejaVuSansMono",
                                    "ttf")),
                    Map.entry(
                            "fallback-dejavu-mono-bold",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/DejaVuSansMono-Bold.ttf",
                                    "DejaVuSansMono-Bold",
                                    "ttf")),
                    Map.entry(
                            "fallback-dejavu-mono-oblique",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/DejaVuSansMono-Oblique.ttf",
                                    "DejaVuSansMono-Oblique",
                                    "ttf")),
                    Map.entry(
                            "fallback-dejavu-mono-boldoblique",
                            new FallbackFontSpec(
                                    "classpath:/static/fonts/DejaVuSansMono-BoldOblique.ttf",
                                    "DejaVuSansMono-BoldOblique",
                                    "ttf")));

    private final ResourceLoader resourceLoader;
    private final stirling.software.common.model.ApplicationProperties applicationProperties;

    @Value("${stirling.pdf.fallback-font:" + DEFAULT_FALLBACK_FONT_LOCATION + "}")
    private String legacyFallbackFontLocation;

    private String fallbackFontLocation;

    private final Map<String, byte[]> fallbackFontCache = new ConcurrentHashMap<>();

    @jakarta.annotation.PostConstruct
    private void loadConfig() {
        String configured = null;
        if (applicationProperties.getPdfEditor() != null) {
            configured = applicationProperties.getPdfEditor().getFallbackFont();
        }
        if (configured != null && !configured.isBlank()) {
            fallbackFontLocation = configured;
        } else {
            fallbackFontLocation = legacyFallbackFontLocation;
        }
        log.info("Using fallback font location: {}", fallbackFontLocation);
    }

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
            // Load with embedSubset=false to ensure full glyph coverage
            // Fallback fonts need all glyphs available for substituting missing characters
            return PDType0Font.load(document, stream, false);
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
            // Only log at debug level to reduce verbosity - summary is logged elsewhere
            log.debug(
                    "[FONT-DEBUG] Font {} cannot encode text '{}' ({}): {}",
                    font != null ? font.getName() : "null",
                    text,
                    font != null ? font.getClass().getSimpleName() : "null",
                    ex.getMessage());
            return false;
        }
    }

    /**
     * Resolve fallback font ID based on the original font name and code point. Attempts to match
     * font family and weight/style for visual consistency.
     *
     * @param originalFontName the name of the original font (may be null)
     * @param codePoint the Unicode code point that needs to be rendered
     * @return fallback font ID
     */
    public String resolveFallbackFontId(String originalFontName, int codePoint) {
        // First try to match based on original font name for visual consistency
        if (originalFontName != null && !originalFontName.isEmpty()) {
            // Normalize font name: remove subset prefix (e.g. "PXAAAC+"), convert to lowercase,
            // remove spaces
            String normalized =
                    originalFontName
                            .replaceAll("^[A-Z]{6}\\+", "") // Remove subset prefix
                            .toLowerCase()
                            .replaceAll("\\s+", ""); // Remove spaces (e.g. "Times New Roman" ->
            // "timesnewroman")

            // Extract base name without weight/style suffixes
            // Split on common delimiters: hyphen, underscore, comma, plus
            // Handles: "Arimo_700wght" -> "arimo", "Arial-Bold" -> "arial", "Arial,Bold" -> "arial"
            String baseName = normalized.split("[-_,+]")[0];

            String aliasedFontId = FONT_NAME_ALIASES.get(baseName);
            if (aliasedFontId != null) {
                // Detect weight and style from the normalized font name
                boolean isBold = detectBold(normalized);
                boolean isItalic = detectItalic(normalized);

                // Apply weight/style suffix to fallback font ID
                String styledFontId = applyWeightStyle(aliasedFontId, isBold, isItalic);

                log.debug(
                        "Matched font '{}' (normalized: '{}', base: '{}', bold: {}, italic: {}) to fallback '{}'",
                        originalFontName,
                        normalized,
                        baseName,
                        isBold,
                        isItalic,
                        styledFontId);
                return styledFontId;
            }
        }

        // Fall back to Unicode-based selection
        return resolveFallbackFontId(codePoint);
    }

    /**
     * Detect if font name indicates bold weight.
     *
     * @param normalizedFontName lowercase font name without subset prefix or spaces
     * @return true if bold weight is detected
     */
    private boolean detectBold(String normalizedFontName) {
        // Check for explicit bold indicators
        if (normalizedFontName.contains("bold")
                || normalizedFontName.contains("heavy")
                || normalizedFontName.contains("black")) {
            return true;
        }

        // Check for numeric weight indicators (600-900 = bold)
        // Handles: "Arimo_700wght", "Arial-700", "Font-w700"
        if (normalizedFontName.matches(".*[_-]?[6-9]00(wght)?.*")) {
            return true;
        }

        return false;
    }

    /**
     * Detect if font name indicates italic/oblique style.
     *
     * @param normalizedFontName lowercase font name without subset prefix or spaces
     * @return true if italic style is detected
     */
    private boolean detectItalic(String normalizedFontName) {
        return normalizedFontName.contains("italic") || normalizedFontName.contains("oblique");
    }

    /**
     * Apply weight/style suffix to fallback font ID.
     *
     * <p>Weight/style variants are only applied to font families where we have the actual font
     * files available. Currently supported: - Liberation Sans: Regular, Bold, Italic, BoldItalic
     * (full support) - Liberation Serif: Regular, Bold, Italic, BoldItalic (full support) -
     * Liberation Mono: Regular, Bold, Italic, BoldItalic (full support) - Noto Sans: Regular, Bold,
     * Italic, BoldItalic (full support) - DejaVu Sans: Regular, Bold, Oblique, BoldOblique (full
     * support) - DejaVu Serif: Regular, Bold, Italic, BoldItalic (full support) - DejaVu Mono:
     * Regular, Bold, Oblique, BoldOblique (full support)
     *
     * <p>To add weight/style support for additional font families: 1. Download the font files
     * (Bold, Italic, BoldItalic) to: app/core/src/main/resources/static/fonts/ 2. Register the
     * variants in BUILT_IN_FALLBACK_FONTS map (see lines 63-267) 3. Update the check below to
     * include the font family prefix
     *
     * @param baseFontId base fallback font ID (e.g., "fallback-liberation-sans")
     * @param isBold true if bold weight needed
     * @param isItalic true if italic style needed
     * @return styled font ID (e.g., "fallback-liberation-sans-bold"), or base ID if variants not
     *     available
     */
    private String applyWeightStyle(String baseFontId, boolean isBold, boolean isItalic) {
        // Only apply weight/style to font families where we have the font files available
        // Supported: Liberation (Sans/Serif/Mono), Noto Sans, DejaVu (Sans/Serif/Mono)
        boolean isSupported =
                baseFontId.startsWith("fallback-liberation-")
                        || baseFontId.equals("fallback-noto-sans")
                        || baseFontId.startsWith("fallback-dejavu-");

        if (!isSupported) {
            return baseFontId;
        }

        // DejaVu Sans and Mono use "oblique" instead of "italic"
        boolean useOblique =
                baseFontId.equals("fallback-dejavu-sans")
                        || baseFontId.equals("fallback-dejavu-mono");

        if (isBold && isItalic) {
            return baseFontId + (useOblique ? "-boldoblique" : "-bolditalic");
        } else if (isBold) {
            return baseFontId + "-bold";
        } else if (isItalic) {
            return baseFontId + (useOblique ? "-oblique" : "-italic");
        }

        return baseFontId;
    }

    /**
     * Resolve fallback font ID based on Unicode code point properties.
     *
     * @param codePoint the Unicode code point
     * @return fallback font ID
     */
    public String resolveFallbackFontId(int codePoint) {
        Character.UnicodeBlock block = Character.UnicodeBlock.of(codePoint);

        // Bopomofo is primarily used in Taiwan for Traditional Chinese phonetic annotation
        if (block == Character.UnicodeBlock.BOPOMOFO
                || block == Character.UnicodeBlock.BOPOMOFO_EXTENDED) {
            return FALLBACK_FONT_TC_ID;
        }

        // Compatibility ideographs are primarily used by Traditional Chinese encodings (e.g., Big5,
        // HKSCS) so prefer the Traditional Chinese fallback here.
        if (block == Character.UnicodeBlock.CJK_COMPATIBILITY_IDEOGRAPHS
                || block == Character.UnicodeBlock.CJK_COMPATIBILITY_IDEOGRAPHS_SUPPLEMENT) {
            return FALLBACK_FONT_TC_ID;
        }

        if (block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_B
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_C
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_D
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_E
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_F
                || block == Character.UnicodeBlock.CJK_SYMBOLS_AND_PUNCTUATION
                || block == Character.UnicodeBlock.HALFWIDTH_AND_FULLWIDTH_FORMS) {
            return FALLBACK_FONT_CJK_ID;
        }

        Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
        return switch (script) {
            // HAN script is used by both Simplified and Traditional Chinese
            // Default to Simplified (mainland China, 1.4B speakers) as it's more common
            // Traditional Chinese PDFs are detected via font name aliases (MingLiU, PMingLiU, etc.)
            case HAN -> FALLBACK_FONT_CJK_ID;
            case HIRAGANA, KATAKANA -> FALLBACK_FONT_JP_ID;
            case HANGUL -> FALLBACK_FONT_KR_ID;
            case ARABIC -> FALLBACK_FONT_AR_ID;
            case THAI -> FALLBACK_FONT_TH_ID;
            case DEVANAGARI -> FALLBACK_FONT_DEVANAGARI_ID;
            case MALAYALAM -> FALLBACK_FONT_MALAYALAM_ID;
            case TIBETAN -> FALLBACK_FONT_TIBETAN_ID;
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
