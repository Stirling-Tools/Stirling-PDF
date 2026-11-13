package stirling.software.SPDF.service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitOption;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
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

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.EditorFontReader.ReadFace;
import stirling.software.common.configuration.InstallationPathConfig;

@Slf4j
@Service
public class EditorFontRegistry {

    static final String BUNDLED_FONTS = "classpath:static/fonts/*";
    static final long MAX_FONT_BYTES = 64L * 1024 * 1024;
    static final Duration RESCAN_INTERVAL = Duration.ofSeconds(30);
    private static final int MAX_FONT_FOLDER_DEPTH = 4;
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

    private record IndexedFace(String family, EditorFontFace face, Path path) {}

    private record BundledFace(String family, EditorFontFace face, Resource resource) {}

    private record ScanEntry(long size, long modified, IndexedFace face) {}

    private final Path root;
    private final String bundledPattern;
    private final Clock clock;
    private final Map<Path, ScanEntry> scanned = new HashMap<>();
    private List<BundledFace> bundled;
    private volatile Map<String, FontFile> bundledById = Map.of();
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
        if (custom == null) {
            return Optional.ofNullable(bundledById.get(id));
        }
        FontFile verified = readVerified(custom);
        if (verified == null) {
            refreshIfDue(true);
            IndexedFace rescanned = customById.get(id);
            verified = rescanned == null ? bundledById.get(id) : readVerified(rescanned);
        }
        return Optional.ofNullable(verified);
    }

    private static FontFile readVerified(IndexedFace face) {
        try {
            byte[] bytes = readBounded(face.path());
            if (bytes == null || !face.face().id().equals(EditorFontReader.sha256(bytes))) {
                return null;
            }
            return new FontFile(new ByteArrayResource(bytes), face.face().format(), bytes.length);
        } catch (IOException e) {
            return null;
        }
    }

    private static byte[] readBounded(Path path) throws IOException {
        try (InputStream in = Files.newInputStream(path)) {
            return readBounded(in);
        }
    }

    private static byte[] readBounded(InputStream in) throws IOException {
        byte[] bytes = in.readNBytes((int) MAX_FONT_BYTES + 1);
        return bytes.length > MAX_FONT_BYTES ? null : bytes;
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
        lastScan = clock.instant();
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
        List<Path> found = new ArrayList<>();
        try {
            Files.walkFileTree(
                    realRoot,
                    EnumSet.noneOf(FileVisitOption.class),
                    MAX_FONT_FOLDER_DEPTH,
                    new SimpleFileVisitor<>() {
                        @Override
                        public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                            Path path = root.resolve(realRoot.relativize(file));
                            if (Files.isRegularFile(path)
                                    && isFontFile(path)
                                    && resolvesInside(path, realRoot)) {
                                found.add(path);
                            }
                            return FileVisitResult.CONTINUE;
                        }

                        @Override
                        public FileVisitResult visitFileFailed(Path file, IOException e) {
                            log.warn(
                                    "Skipping editor fonts under {}: {}",
                                    root.resolve(realRoot.relativize(file)),
                                    e.toString());
                            return FileVisitResult.CONTINUE;
                        }
                    });
        } catch (IOException e) {
            log.warn("Could not list editor fonts in {}: {}", root, e.getMessage());
            return List.of();
        }
        found.sort(null);
        return found;
    }

    private static boolean isFontFile(Path path) {
        String name = path.getFileName().toString();
        return EditorFontReader.formatOf(name) != null || EditorFontReader.isUnsupported(name);
    }

    private static boolean resolvesInside(Path path, Path realRoot) {
        try {
            return path.toRealPath().startsWith(realRoot);
        } catch (IOException e) {
            return false;
        }
    }

    private static String formatOf(Path path) {
        return EditorFontReader.formatOf(path.getFileName().toString());
    }

    private IndexedFace index(Path path, long size, long modified) {
        if (formatOf(path) == null) {
            log.info("Skipping editor font {}: only .ttf and .otf files are supported", path);
            return null;
        }
        if (size > MAX_FONT_BYTES) {
            log.warn(
                    "Skipping editor font {}: {} bytes exceeds the {} byte limit",
                    path,
                    size,
                    MAX_FONT_BYTES);
            return null;
        }
        try {
            byte[] bytes = readBounded(path);
            BasicFileAttributes after = Files.readAttributes(path, BasicFileAttributes.class);
            if (bytes == null
                    || bytes.length != size
                    || after.size() != size
                    || after.lastModifiedTime().toMillis() != modified) {
                log.warn("Skipping editor font {}: it changed while being read", path);
                return null;
            }
            ReadFace read = EditorFontReader.read(bytes, formatOf(path), path);
            return read == null ? null : new IndexedFace(read.family(), read.face(), path);
        } catch (IOException e) {
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
            String format = filename == null ? null : EditorFontReader.formatOf(filename);
            if (format == null) {
                continue;
            }
            try (InputStream in = resource.getInputStream()) {
                byte[] bytes = readBounded(in);
                ReadFace read =
                        bytes == null ? null : EditorFontReader.read(bytes, format, filename);
                if (read != null) {
                    faces.add(new BundledFace(read.family(), read.face(), resource));
                }
            } catch (IOException e) {
                log.warn("Skipping bundled editor font {}: {}", filename, e.getMessage());
            }
        }
        return List.copyOf(faces);
    }

    private void publish() {
        Map<String, FontFile> bundledFiles = new LinkedHashMap<>();
        Map<String, IndexedFace> customs = new LinkedHashMap<>();
        Map<String, List<EditorFontFace>> grouped = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        for (ScanEntry entry : new TreeMap<>(scanned).values()) {
            IndexedFace face = entry.face();
            if (face == null || customs.containsKey(face.face().id())) {
                continue;
            }
            customs.put(face.face().id(), face);
            grouped.computeIfAbsent(face.family(), k -> new ArrayList<>()).add(face.face());
        }
        Set<String> customFamilies = new HashSet<>();
        for (String family : grouped.keySet()) {
            customFamilies.add(family.toLowerCase(Locale.ROOT));
        }
        for (BundledFace face : bundled) {
            String id = face.face().id();
            if (customs.containsKey(id) || bundledFiles.containsKey(id)) {
                continue;
            }
            bundledFiles.put(
                    id, new FontFile(face.resource(), face.face().format(), face.face().size()));
            if (customFamilies.contains(face.family().toLowerCase(Locale.ROOT))) {
                continue;
            }
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
        bundledById = Map.copyOf(bundledFiles);
        snapshot = new Snapshot(new EditorFontManifest(List.copyOf(families)), etagOf(families));
    }

    private static String etagOf(List<EditorFontFamily> families) {
        MessageDigest digest = EditorFontReader.newDigest();
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
