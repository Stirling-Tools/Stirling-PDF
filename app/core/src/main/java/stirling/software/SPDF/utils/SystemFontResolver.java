package stirling.software.SPDF.utils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

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
 * <p>The bundled fallbacks cover the common Chinese and Japanese repertoires plus every modern
 * Hangul syllable, but not rare Han characters. An installed face is preferred on every platform
 * (macOS, Windows, Linux, and AppImage/flatpak mounts); the bundled copy is the last resort.
 *
 * <p>Only TrueType-outline faces are accepted: PDFBox writes them as CIDFontType2 and throws {@code
 * OTF fonts do not have a glyf table} for CFF/OpenType collections. That rules out macOS
 * PingFang/Hiragino/AppleSDGothicNeo and Linux Noto CJK, which are CFF.
 */
@Slf4j
@Component
public class SystemFontResolver {

    private static final String CJK_FALLBACK_CLASSPATH = "static/fonts/StirlingSansCJK-Regular.ttf";
    private static final String KOREAN_FALLBACK_CLASSPATH =
            "static/fonts/StirlingSansKR-Regular.ttf";

    /**
     * Every sample must be present before a face is used. Short samples let partial faces through
     * (macOS AquaKana has kana and 日 but almost no kanji), and PDFBox aborts the whole operation on
     * the first character the face lacks.
     */
    private static final Map<String, int[]> COVERAGE_SAMPLES =
            Map.of(
                    "chinese", "中文测试的是不了我你他国家人民时间学习工作".codePoints().toArray(),
                    "japanese", "日本語のかなカナです東京大阪学校時間仕事".codePoints().toArray(),
                    "korean", "가나다한글대한민국서울시간사람".codePoints().toArray(),
                    "traditional", "臺灣繁體中文國家時間學習工作".codePoints().toArray());

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
                            Path.of("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"),
                            Path.of("/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"),
                            Path.of("/usr/share/fonts/truetype/arphic/uming.ttc"),
                            Path.of("/usr/share/fonts/truetype/unifont/unifont.ttf"),
                            // macOS ships Heiti as TrueType; Songti/Hiragino/PingFang are CFF
                            // collections, which PDFBox cannot embed.
                            Path.of("/System/Library/Fonts/STHeiti Light.ttc"),
                            Path.of("/System/Library/Fonts/STHeiti Medium.ttc"),
                            Path.of("/System/Library/Fonts/Songti.ttc"),
                            Path.of("/System/Library/Fonts/Supplemental/Songti.ttc"),
                            Path.of("/System/Library/Fonts/Hiragino Sans GB.ttc"),
                            Path.of("C:/Windows/Fonts/msyh.ttc")),
                    "japanese",
                    List.of(
                            Path.of("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
                            Path.of("/usr/share/fonts/truetype/fonts-japanese-gothic.ttf"),
                            Path.of("/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"),
                            Path.of("/usr/share/fonts/truetype/fonts-japanese-mincho.ttf"),
                            Path.of("/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc"),
                            Path.of("/System/Library/Fonts/Supplemental/Osaka.ttf"),
                            Path.of("C:/Windows/Fonts/meiryo.ttc"),
                            Path.of("C:/Windows/Fonts/msgothic.ttc")),
                    "korean",
                    List.of(
                            Path.of("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
                            Path.of("/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"),
                            Path.of("/usr/share/fonts/truetype/nanum/NanumGothic.ttf"),
                            Path.of("/usr/share/fonts/truetype/unifont/unifont.ttf"),
                            Path.of("/System/Library/Fonts/AppleSDGothicNeo.ttc"),
                            Path.of("C:/Windows/Fonts/malgun.ttf"),
                            Path.of("C:/Windows/Fonts/malgun.ttc")),
                    "traditional",
                    List.of(
                            Path.of("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
                            Path.of("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"),
                            Path.of("/usr/share/fonts/truetype/arphic/uming.ttc"),
                            Path.of("/System/Library/Fonts/STHeiti Medium.ttc"),
                            Path.of("/System/Library/Fonts/Songti.ttc"),
                            Path.of("/System/Library/Fonts/Supplemental/Songti.ttc"),
                            Path.of("C:/Windows/Fonts/msjh.ttc")));

    /**
     * Scanned when no explicit candidate or fontconfig match works. macOS treats many faces as
     * downloadable-only, so a face installed later can live outside the curated list.
     */
    private static final List<Path> FONT_DIRECTORIES = fontDirectories();

    private static List<Path> fontDirectories() {
        String home = System.getProperty("user.home", ".");
        List<Path> directories = new ArrayList<>();
        directories.add(Path.of("/System/Library/Fonts"));
        directories.add(Path.of("/System/Library/Fonts/Supplemental"));
        directories.add(Path.of("/Library/Fonts"));
        directories.add(Path.of(home, "Library", "Fonts"));
        directories.add(Path.of("C:/Windows/Fonts"));
        addIfPresent(directories, System.getenv("LOCALAPPDATA"), "Microsoft", "Windows", "Fonts");
        directories.add(Path.of("/usr/share/fonts"));
        directories.add(Path.of("/usr/local/share/fonts"));
        // Flatpak exposes the host font set here; AppImage mounts the payload under $APPDIR.
        directories.add(Path.of("/run/host/fonts"));
        directories.add(Path.of("/app/share/fonts"));
        addIfPresent(directories, System.getenv("APPDIR"), "usr", "share", "fonts");
        directories.add(Path.of(home, ".local", "share", "fonts"));
        directories.add(Path.of(home, ".fonts"));
        addIfPresent(directories, System.getenv("XDG_DATA_HOME"), "fonts");
        return List.copyOf(directories);
    }

    private static void addIfPresent(List<Path> directories, String base, String... parts) {
        if (base == null || base.isBlank()) {
            return;
        }
        Path path = Path.of(base);
        for (String part : parts) {
            path = path.resolve(part);
        }
        directories.add(path);
    }

    private static final int MAX_SCANNED_FONTS = 400;

    private final Map<String, List<ResolvedFont>> resolved = new ConcurrentHashMap<>();

    /**
     * Loads the best available CJK face into {@code document}. Tries installed faces in order until
     * one embeds, then the bundled fallback; throws when a build ships neither.
     */
    public PDFont loadCjkFont(PDDocument document, String alphabet) throws IOException {
        String language = normalize(alphabet);
        String fallback = fallbackClasspath(language);
        for (ResolvedFont font : resolve(language)) {
            try {
                PDFont loaded = load(document, font);
                log.info("Using installed {} font {} for PDF text", language, font.path());
                return loaded;
            } catch (IOException | RuntimeException e) {
                log.warn(
                        "System CJK font {} could not be used ({}); trying the next face",
                        font.path(),
                        e.getMessage());
            }
        }
        if (!new ClassPathResource(fallback).exists()) {
            throw new IOException(
                    "No embeddable "
                            + language
                            + " font found. Install a TrueType-outline CJK face or set -Dstirling.fonts."
                            + language
                            + "=/path/to/font.ttf (this build omits "
                            + fallback
                            + ").");
        }
        log.debug("Using bundled {} fallback {}", language, fallback);
        return loadClasspath(document, fallback);
    }

    private static String fallbackClasspath(String language) {
        return "korean".equals(language) ? KOREAN_FALLBACK_CLASSPATH : CJK_FALLBACK_CLASSPATH;
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

    private List<ResolvedFont> resolve(String language) {
        return resolved.computeIfAbsent(language, this::resolveUncached);
    }

    private List<ResolvedFont> resolveUncached(String language) {
        List<ResolvedFont> fonts = new ArrayList<>();

        String override = System.getProperty("stirling.fonts." + language);
        if (override != null && !override.isBlank()) {
            inspect(Path.of(override), language).ifPresent(fonts::add);
            if (fonts.isEmpty()) {
                log.warn(
                        "Configured CJK font {} is not readable or lacks the required glyphs",
                        override);
            }
        }

        for (Path candidate : CANDIDATES.getOrDefault(language, List.of())) {
            inspect(candidate, language).ifPresent(fonts::add);
        }

        for (String family : FC_FAMILIES.getOrDefault(language, List.of())) {
            Path path = fcMatch(family);
            if (path == null) {
                continue;
            }
            inspect(path, language).ifPresent(fonts::add);
        }

        if (!fonts.isEmpty()) {
            return List.copyOf(fonts);
        }

        // fontconfig can answer "which installed face contains this character", which covers
        // distros whose CJK packaging uses family names the curated list does not know.
        int probe = COVERAGE_SAMPLES.getOrDefault(language, COVERAGE_SAMPLES.get("chinese"))[0];
        Path charsetMatch = fcMatch(":charset=" + Integer.toHexString(probe));
        if (charsetMatch != null) {
            inspect(charsetMatch, language).ifPresent(fonts::add);
        }
        if (!fonts.isEmpty()) {
            return List.copyOf(fonts);
        }

        fonts.addAll(scanFontDirectories(language));
        return List.copyOf(fonts);
    }

    private List<ResolvedFont> scanFontDirectories(String language) {
        List<ResolvedFont> found = new ArrayList<>();
        int inspected = 0;
        for (Path directory : FONT_DIRECTORIES) {
            if (!Files.isDirectory(directory)) {
                continue;
            }
            List<Path> files;
            try (Stream<Path> walk = Files.walk(directory, 3)) {
                files = walk.filter(SystemFontResolver::isFontFile).sorted().toList();
            } catch (IOException | RuntimeException e) {
                log.debug("Cannot scan {} for CJK fonts: {}", directory, e.getMessage());
                continue;
            }
            for (Path path : files) {
                if (inspected++ >= MAX_SCANNED_FONTS) {
                    return found;
                }
                inspect(path, language).ifPresent(found::add);
            }
        }
        return found;
    }

    private static boolean isFontFile(Path path) {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        // .otf is CFF by definition; inspecting it would only fail the glyf check.
        return name.endsWith(".ttf") || name.endsWith(".ttc") || name.endsWith(".otc");
    }

    private Optional<ResolvedFont> inspect(Path path, String language) {
        if (path == null || !Files.isRegularFile(path)) {
            return Optional.empty();
        }
        int[] samples = COVERAGE_SAMPLES.getOrDefault(language, COVERAGE_SAMPLES.get("chinese"));
        try {
            String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
            if (name.endsWith(".ttc") || name.endsWith(".otc")) {
                AtomicReference<ResolvedFont> found = new AtomicReference<>();
                try (TrueTypeCollection collection = new TrueTypeCollection(path.toFile())) {
                    collection.processAllFonts(
                            font -> {
                                if (found.get() == null && hasCoverage(font, samples)) {
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
                return hasCoverage(font, samples)
                        ? Optional.ofNullable(new ResolvedFont(path, null))
                        : Optional.empty();
            }
        } catch (IOException | RuntimeException e) {
            log.debug("Cannot inspect CJK font {}: {}", path, e.getMessage());
            return Optional.empty();
        }
    }

    private static boolean hasCoverage(TrueTypeFont font, int[] codePoints) {
        try {
            // PDFBox can embed TrueType outlines from a glyf table, not CFF/OTF. A
            // matching cmap is not enough: Noto CJK's Linux TTC has one and still
            // fails while the document is written.
            if (!font.getTableMap().containsKey("glyf")) {
                return false;
            }
            for (int codePoint : codePoints) {
                if (font.getUnicodeCmapLookup().getGlyphId(codePoint) == 0) {
                    return false;
                }
            }
            return true;
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

    private static String normalize(String alphabet) {
        return alphabet == null ? "chinese" : alphabet.toLowerCase(Locale.ROOT);
    }

    private record ResolvedFont(Path path, String faceName) {}
}
