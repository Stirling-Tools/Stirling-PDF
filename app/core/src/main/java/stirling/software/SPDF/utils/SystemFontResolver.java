package stirling.software.SPDF.utils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.apache.fontbox.ttf.TTFParser;
import org.apache.fontbox.ttf.TrueTypeCollection;
import org.apache.fontbox.ttf.TrueTypeFont;
import org.apache.pdfbox.io.RandomAccessRead;
import org.apache.pdfbox.io.RandomAccessReadBufferedFile;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Resolves CJK text to an installed font before falling back to the compact bundled face.
 *
 * <p>The bundled fallback is Droid Sans Fallback: it covers the common Chinese, Japanese and Korean
 * repertoires but not Latin, every modern Hangul syllable or rare Han characters. Hosts that ship
 * Noto CJK (the Docker base image does) get the complete face from the system instead.
 */
@Slf4j
@Component
public class SystemFontResolver {

    private static final String FALLBACK_CLASSPATH = "static/fonts/StirlingSansCJK-Regular.ttf";
    private static final int SAMPLE_CHINESE = 0x4E2D; // 中
    private static final int SAMPLE_JAPANESE = 0x65E5; // 日
    private static final int SAMPLE_KOREAN = 0xAC00; // 가
    private static final int SAMPLE_TRADITIONAL = 0x81FA; // 臺

    private static final Map<String, List<String>> FC_FAMILIES =
            Map.of(
                    "chinese",
                    List.of(
                            "Noto Sans CJK SC",
                            "Noto Sans SC",
                            "Source Han Sans SC",
                            "PingFang SC"),
                    "japanese",
                    List.of("Noto Sans CJK JP", "Noto Sans JP", "Hiragino Sans", "Yu Gothic"),
                    "korean",
                    List.of(
                            "Noto Sans CJK KR",
                            "Noto Sans KR",
                            "Malgun Gothic",
                            "Apple SD Gothic Neo"),
                    "traditional",
                    List.of(
                            "Noto Sans CJK TC",
                            "Noto Sans TC",
                            "PingFang TC",
                            "Microsoft JhengHei"));

    private static final Map<String, List<Path>> CANDIDATES =
            Map.of(
                    "chinese",
                    List.of(
                            Path.of("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
                            Path.of("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"),
                            Path.of("/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"),
                            Path.of("/System/Library/Fonts/Supplemental/Songti.ttc"),
                            Path.of("/System/Library/Fonts/Hiragino Sans GB.ttc"),
                            Path.of("C:/Windows/Fonts/msyh.ttc")),
                    "japanese",
                    List.of(
                            Path.of("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
                            Path.of("/usr/share/fonts/truetype/fonts-japanese-gothic.ttf"),
                            Path.of("/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc"),
                            Path.of("/System/Library/Fonts/Supplemental/Osaka.ttf"),
                            Path.of("C:/Windows/Fonts/meiryo.ttc"),
                            Path.of("C:/Windows/Fonts/msgothic.ttc")),
                    "korean",
                    List.of(
                            Path.of("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
                            Path.of("/System/Library/Fonts/AppleSDGothicNeo.ttc"),
                            Path.of("C:/Windows/Fonts/malgun.ttf"),
                            Path.of("C:/Windows/Fonts/malgun.ttc")),
                    "traditional",
                    List.of(
                            Path.of("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
                            Path.of("/System/Library/Fonts/Supplemental/Songti.ttc"),
                            Path.of("C:/Windows/Fonts/msjh.ttc")));

    private final Map<String, Optional<ResolvedFont>> resolved = new ConcurrentHashMap<>();

    /**
     * Loads the best available CJK face into {@code document}. Never returns null: when no
     * installed face can be read, the bundled Droid face is used.
     */
    public PDFont loadCjkFont(PDDocument document, String alphabet) throws IOException {
        ResolvedFont font = resolve(alphabet).orElse(null);
        if (font != null) {
            try {
                return load(document, font);
            } catch (IOException | RuntimeException e) {
                log.warn(
                        "System CJK font {} could not be used ({}); falling back to {}",
                        font.path(),
                        e.getMessage(),
                        FALLBACK_CLASSPATH);
            }
        }
        return loadClasspath(document, FALLBACK_CLASSPATH);
    }

    private PDFont load(PDDocument document, ResolvedFont font) throws IOException {
        if (font.faceName() != null) {
            TrueTypeCollection collection = new TrueTypeCollection(font.path().toFile());
            try {
                TrueTypeFont face = collection.getFontByName(font.faceName());
                if (face == null) {
                    throw new IOException("Font face not found: " + font.faceName());
                }
                // PDFBox copies the tables it needs during load; the collection can be closed
                // before the document is written.
                return PDType0Font.load(document, face, true);
            } finally {
                collection.close();
            }
        }
        try (InputStream input = Files.newInputStream(font.path())) {
            return PDType0Font.load(document, input);
        }
    }

    private PDFont loadClasspath(PDDocument document, String location) throws IOException {
        try (InputStream input = new ClassPathResource(location).getInputStream()) {
            return PDType0Font.load(document, input);
        }
    }

    private Optional<ResolvedFont> resolve(String alphabet) {
        String language = normalize(alphabet);
        return resolved.computeIfAbsent(language, this::resolveUncached);
    }

    private Optional<ResolvedFont> resolveUncached(String language) {
        String override = System.getProperty("stirling.fonts." + language);
        if (override != null && !override.isBlank()) {
            Optional<ResolvedFont> font = inspect(Path.of(override), sample(language), language);
            if (font.isPresent()) {
                return font;
            }
            log.warn(
                    "Configured CJK font {} is not readable or lacks the required glyphs",
                    override);
        }

        for (Path candidate : CANDIDATES.getOrDefault(language, List.of())) {
            Optional<ResolvedFont> font = inspect(candidate, sample(language), language);
            if (font.isPresent()) {
                return font;
            }
        }

        for (String family : FC_FAMILIES.getOrDefault(language, List.of())) {
            Path path = fcMatch(family);
            if (path == null) {
                continue;
            }
            Optional<ResolvedFont> font = inspect(path, sample(language), language);
            if (font.isPresent()) {
                return font;
            }
        }
        return Optional.empty();
    }

    private Optional<ResolvedFont> inspect(Path path, int sample, String language) {
        if (path == null || !Files.isRegularFile(path)) {
            return Optional.empty();
        }
        try {
            String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
            if (name.endsWith(".ttc") || name.endsWith(".otc")) {
                AtomicReference<ResolvedFont> found = new AtomicReference<>();
                try (TrueTypeCollection collection = new TrueTypeCollection(path.toFile())) {
                    collection.processAllFonts(
                            font -> {
                                if (found.get() == null && hasGlyph(font, sample)) {
                                    try {
                                        found.set(new ResolvedFont(path, font.getName()));
                                    } catch (IOException e) {
                                        // Try the next face.
                                    }
                                }
                            });
                }
                return Optional.ofNullable(found.get());
            }

            try (RandomAccessRead input = new RandomAccessReadBufferedFile(path.toFile());
                    TrueTypeFont font = new TTFParser().parse(input)) {
                return hasGlyph(font, sample)
                        ? Optional.of(new ResolvedFont(path, null))
                        : Optional.empty();
            }
        } catch (IOException | RuntimeException e) {
            log.debug("Cannot inspect CJK font {}: {}", path, e.getMessage());
            return Optional.empty();
        }
    }

    private static boolean hasGlyph(TrueTypeFont font, int codePoint) {
        try {
            // PDFBox can embed TrueType outlines from a glyf table, not CFF/OTF. A
            // matching cmap is not enough: Noto CJK's Linux TTC has one and still
            // fails while the document is written.
            if (!font.getTableMap().containsKey("glyf")) {
                return false;
            }
            return font.getUnicodeCmapLookup().getGlyphId(codePoint) != 0;
        } catch (IOException | RuntimeException e) {
            return false;
        }
    }

    private Path fcMatch(String family) {
        try {
            Process process =
                    new ProcessBuilder("fc-match", "-f", "%{file}", family)
                            .redirectErrorStream(true)
                            .start();
            if (!process.waitFor(2, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return null;
            }
            String output;
            try (InputStream input = process.getInputStream()) {
                output = new String(input.readAllBytes()).trim();
            }
            if (process.exitValue() != 0 || output.isBlank()) {
                return null;
            }
            return Path.of(output);
        } catch (IOException e) {
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    private static int sample(String language) {
        return switch (language) {
            case "japanese" -> SAMPLE_JAPANESE;
            case "korean" -> SAMPLE_KOREAN;
            case "traditional" -> SAMPLE_TRADITIONAL;
            default -> SAMPLE_CHINESE;
        };
    }

    private static String normalize(String alphabet) {
        return alphabet == null ? "chinese" : alphabet.toLowerCase(Locale.ROOT);
    }

    private record ResolvedFont(Path path, String faceName) {}
}
