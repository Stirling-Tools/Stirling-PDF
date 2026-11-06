package stirling.software.SPDF.service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.apache.fontbox.ttf.HeaderTable;
import org.apache.fontbox.ttf.NameRecord;
import org.apache.fontbox.ttf.NamingTable;
import org.apache.fontbox.ttf.OS2WindowsMetricsTable;
import org.apache.fontbox.ttf.OTFParser;
import org.apache.fontbox.ttf.OpenTypeFont;
import org.apache.fontbox.ttf.TTFParser;
import org.apache.fontbox.ttf.TrueTypeFont;
import org.apache.pdfbox.io.RandomAccessRead;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.io.RandomAccessReadBufferedFile;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;

@Slf4j
@Service
public class EditorFontRegistry {

    static final String BUNDLED_FONTS = "classpath:static/fonts/*";
    static final long MAX_FONT_BYTES = 64L * 1024 * 1024;
    static final Duration RESCAN_INTERVAL = Duration.ofSeconds(30);
    private static final int MAX_DEPTH = 4;
    private static final int FS_TYPE_RESTRICTED = 0x0002;
    private static final int FS_TYPE_BITMAP_ONLY = 0x0200;
    private static final int FS_SELECTION_ITALIC = 0x0001;
    private static final int FS_SELECTION_BOLD = 0x0020;
    private static final int FS_SELECTION_OBLIQUE = 0x0200;
    private static final int MAC_STYLE_BOLD = 0x0001;
    private static final int MAC_STYLE_ITALIC = 0x0002;
    private static final int NAME_TYPOGRAPHIC_FAMILY = 16;
    private static final int NAME_TYPOGRAPHIC_SUBFAMILY = 17;
    private static final Pattern FONT_ID = Pattern.compile("[0-9a-f]{64}");

    public record EditorFontFace(
            String id,
            String style,
            boolean bold,
            boolean italic,
            int weight,
            String postscriptName,
            String format,
            long size) {}

    public record EditorFontFamily(String family, List<EditorFontFace> faces) {}

    public record EditorFontManifest(List<EditorFontFamily> families) {}

    public record Snapshot(EditorFontManifest manifest, String etag) {}

    public record FontFile(Resource resource, String format, long size) {}

    private record IndexedFace(String family, EditorFontFace face, Path path, long modified) {}

    private record BundledFace(String family, EditorFontFace face, Resource resource) {}

    private record FaceInfo(
            String family,
            String style,
            boolean bold,
            boolean italic,
            int weight,
            String postscriptName) {}

    private record ScanEntry(long size, long modified, IndexedFace face) {}

    private final Path root;
    private final String bundledPattern;
    private final Clock clock;
    private final Map<Path, ScanEntry> scanned = new HashMap<>();
    private List<BundledFace> bundled;
    private volatile Map<String, FontFile> byId = Map.of();
    private volatile Map<String, IndexedFace> customById = Map.of();
    private volatile Snapshot snapshot = emptySnapshot();
    private volatile Instant lastScan = Instant.MIN;

    @Autowired
    public EditorFontRegistry() {
        this(
                Path.of(InstallationPathConfig.getStaticPath(), "fonts"),
                BUNDLED_FONTS,
                Clock.systemUTC());
    }

    EditorFontRegistry(Path root, String bundledPattern, Clock clock) {
        this.root = root;
        this.bundledPattern = bundledPattern;
        this.clock = clock;
    }

    public Snapshot snapshot() {
        refreshIfDue(false);
        return snapshot;
    }

    public Optional<FontFile> resolve(String id) {
        if (id == null || !FONT_ID.matcher(id).matches()) {
            return Optional.empty();
        }
        refreshIfDue(false);
        IndexedFace custom = customById.get(id);
        if (custom != null && !isUnchanged(custom)) {
            refreshIfDue(true);
        }
        return Optional.ofNullable(byId.get(id));
    }

    private boolean isUnchanged(IndexedFace face) {
        try {
            BasicFileAttributes attrs =
                    Files.readAttributes(face.path(), BasicFileAttributes.class);
            return attrs.size() == face.face().size()
                    && attrs.lastModifiedTime().toMillis() == face.modified();
        } catch (IOException e) {
            return false;
        }
    }

    private void refreshIfDue(boolean force) {
        if (!force && !isScanDue()) {
            return;
        }
        rescan(force);
    }

    private boolean isScanDue() {
        return !lastScan.plus(RESCAN_INTERVAL).isAfter(clock.instant());
    }

    private synchronized void rescan(boolean force) {
        if (!force && !isScanDue()) {
            return;
        }
        lastScan = clock.instant();
        if (bundled == null) {
            bundled = loadBundled();
        }
        Map<Path, ScanEntry> next = new HashMap<>();
        for (Path path : listFontFiles()) {
            BasicFileAttributes attrs;
            try {
                attrs = Files.readAttributes(path, BasicFileAttributes.class);
            } catch (IOException e) {
                continue;
            }
            long size = attrs.size();
            long modified = attrs.lastModifiedTime().toMillis();
            ScanEntry previous = scanned.get(path);
            if (previous != null && previous.size() == size && previous.modified() == modified) {
                next.put(path, previous);
                continue;
            }
            next.put(path, new ScanEntry(size, modified, index(path, size, modified)));
        }
        scanned.clear();
        scanned.putAll(next);
        publish();
    }

    private List<Path> listFontFiles() {
        if (!Files.isDirectory(root)) {
            return List.of();
        }
        Path realRoot;
        try {
            realRoot = root.toRealPath();
        } catch (IOException e) {
            return List.of();
        }
        try (Stream<Path> walk = Files.walk(root, MAX_DEPTH)) {
            return walk.filter(Files::isRegularFile)
                    .filter(p -> formatOf(p) != null)
                    .filter(p -> resolvesInside(p, realRoot))
                    .sorted()
                    .toList();
        } catch (IOException | RuntimeException e) {
            log.warn("Could not list editor fonts in {}: {}", root, e.getMessage());
            return List.of();
        }
    }

    private static boolean resolvesInside(Path path, Path realRoot) {
        try {
            return path.toRealPath().startsWith(realRoot);
        } catch (IOException e) {
            return false;
        }
    }

    private static String formatOf(Path path) {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (name.endsWith(".ttf")) return "ttf";
        if (name.endsWith(".otf")) return "otf";
        return null;
    }

    private IndexedFace index(Path path, long size, long modified) {
        if (size > MAX_FONT_BYTES) {
            log.warn(
                    "Skipping editor font {}: {} bytes exceeds the {} byte limit",
                    path,
                    size,
                    MAX_FONT_BYTES);
            return null;
        }
        String format = formatOf(path);
        try (RandomAccessRead in = new RandomAccessReadBufferedFile(path.toFile())) {
            FaceInfo info = describe(in, format, path);
            if (info == null) {
                return null;
            }
            return new IndexedFace(
                    info.family(), faceOf(info, sha256(path), format, size), path, modified);
        } catch (IOException | RuntimeException e) {
            log.warn("Skipping editor font {}: {}", path, e.getMessage());
            return null;
        }
    }

    private List<BundledFace> loadBundled() {
        if (bundledPattern == null) {
            return List.of();
        }
        Resource[] resources;
        try {
            resources = new PathMatchingResourcePatternResolver().getResources(bundledPattern);
        } catch (IOException e) {
            log.warn("Could not list bundled editor fonts: {}", e.getMessage());
            return List.of();
        }
        List<BundledFace> faces = new ArrayList<>();
        for (Resource resource : resources) {
            String filename = resource.getFilename();
            String format = filename == null ? null : formatOf(Path.of(filename));
            if (format == null) {
                continue;
            }
            try (InputStream in = resource.getInputStream()) {
                byte[] bytes = in.readNBytes((int) MAX_FONT_BYTES + 1);
                if (bytes.length > MAX_FONT_BYTES) {
                    continue;
                }
                FaceInfo info;
                try (RandomAccessRead buffer = new RandomAccessReadBuffer(bytes)) {
                    info = describe(buffer, format, filename);
                }
                if (info != null) {
                    String id = HexFormat.of().formatHex(newDigest().digest(bytes));
                    faces.add(
                            new BundledFace(
                                    info.family(),
                                    faceOf(info, id, format, bytes.length),
                                    resource));
                }
            } catch (IOException | RuntimeException e) {
                log.warn("Skipping bundled editor font {}: {}", filename, e.getMessage());
            }
        }
        return List.copyOf(faces);
    }

    private static EditorFontFace faceOf(FaceInfo info, String id, String format, long size) {
        return new EditorFontFace(
                id,
                info.style(),
                info.bold(),
                info.italic(),
                info.weight(),
                info.postscriptName(),
                format,
                size);
    }

    private static FaceInfo describe(RandomAccessRead in, String format, Object source)
            throws IOException {
        try (TrueTypeFont font =
                "otf".equals(format) ? new OTFParser().parse(in) : new TTFParser().parse(in)) {
            if (font instanceof OpenTypeFont otf && otf.isPostScript()) {
                log.info(
                        "Skipping editor font {}: CFF outlines cannot be embedded as TrueType",
                        source);
                return null;
            }
            if (font.getTableMap().containsKey("fvar")) {
                log.info(
                        "Skipping editor font {}: variable fonts embed only their default instance",
                        source);
                return null;
            }
            OS2WindowsMetricsTable os2 = font.getOS2Windows();
            int fsType = os2 == null ? 0 : os2.getFsType() & 0xFFFF;
            if ((fsType & (FS_TYPE_RESTRICTED | FS_TYPE_BITMAP_ONLY)) != 0) {
                log.info(
                        "Skipping editor font {}: its licence forbids embedding (fsType {})",
                        source,
                        fsType);
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
            String style =
                    firstNonBlank(
                            name(naming, NAME_TYPOGRAPHIC_SUBFAMILY),
                            naming.getFontSubFamily(),
                            "Regular");
            String postscriptName = firstNonBlank(naming.getPostScriptName(), "");
            int weight = os2 == null || os2.getWeightClass() <= 0 ? -1 : os2.getWeightClass();
            HeaderTable header = font.getHeader();
            int macStyle = header == null ? 0 : header.getMacStyle();
            int fsSelection = os2 == null ? 0 : os2.getFsSelection();
            boolean bold = weight >= 0 ? weight >= 600 : (macStyle & MAC_STYLE_BOLD) != 0;
            if (weight < 0 && (fsSelection & FS_SELECTION_BOLD) != 0) bold = true;
            boolean italic =
                    (fsSelection & (FS_SELECTION_ITALIC | FS_SELECTION_OBLIQUE)) != 0
                            || (macStyle & MAC_STYLE_ITALIC) != 0;
            if (weight < 0) weight = bold ? 700 : 400;
            return new FaceInfo(family, style, bold, italic, weight, postscriptName);
        }
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

    private static String sha256(Path path) throws IOException {
        MessageDigest digest = newDigest();
        try (InputStream in = Files.newInputStream(path)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) > 0) {
                digest.update(buffer, 0, read);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private static MessageDigest newDigest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private void publish() {
        Map<String, FontFile> files = new LinkedHashMap<>();
        Map<String, IndexedFace> customs = new LinkedHashMap<>();
        Map<String, List<EditorFontFace>> grouped = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        for (ScanEntry entry : new TreeMap<>(scanned).values()) {
            IndexedFace face = entry.face();
            if (face == null || files.containsKey(face.face().id())) continue;
            customs.put(face.face().id(), face);
            files.put(face.face().id(), fileOf(face.face(), new FileSystemResource(face.path())));
            grouped.computeIfAbsent(face.family(), k -> new ArrayList<>()).add(face.face());
        }
        Set<String> customFamilies = new HashSet<>();
        for (String family : grouped.keySet()) {
            customFamilies.add(family.toLowerCase(Locale.ROOT));
        }
        for (BundledFace face : bundled) {
            if (customFamilies.contains(face.family().toLowerCase(Locale.ROOT))
                    || files.containsKey(face.face().id())) continue;
            files.put(face.face().id(), fileOf(face.face(), face.resource()));
            grouped.computeIfAbsent(face.family(), k -> new ArrayList<>()).add(face.face());
        }
        List<EditorFontFamily> families = new ArrayList<>();
        for (Map.Entry<String, List<EditorFontFace>> group : grouped.entrySet()) {
            List<EditorFontFace> faces = new ArrayList<>(group.getValue());
            faces.sort(
                    Comparator.comparingInt(EditorFontFace::weight)
                            .thenComparing(EditorFontFace::italic)
                            .thenComparing(EditorFontFace::style));
            families.add(new EditorFontFamily(group.getKey(), List.copyOf(faces)));
        }
        customById = Map.copyOf(customs);
        byId = Map.copyOf(files);
        snapshot = new Snapshot(new EditorFontManifest(List.copyOf(families)), etagOf(families));
    }

    private static FontFile fileOf(EditorFontFace face, Resource resource) {
        return new FontFile(resource, face.format(), face.size());
    }

    private static String etagOf(List<EditorFontFamily> families) {
        MessageDigest digest = newDigest();
        for (EditorFontFamily family : families) {
            digest.update(family.family().getBytes(StandardCharsets.UTF_8));
            for (EditorFontFace face : family.faces()) {
                digest.update((byte) 0);
                digest.update(face.id().getBytes(StandardCharsets.UTF_8));
                digest.update(face.style().getBytes(StandardCharsets.UTF_8));
            }
            digest.update((byte) 1);
        }
        return HexFormat.of().formatHex(digest.digest()).substring(0, 32);
    }

    private static Snapshot emptySnapshot() {
        return new Snapshot(new EditorFontManifest(List.of()), etagOf(List.of()));
    }
}
