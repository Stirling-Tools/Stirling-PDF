package stirling.software.proprietary.policy.output;

import static java.nio.file.LinkOption.NOFOLLOW_LINKS;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.FileTime;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;
import java.util.TreeMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.ledger.FolderIdentities;
import stirling.software.proprietary.policy.ledger.ProcessedFileStatus;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Expires originals seven days after their files are first confirmed absent. Hidden marker files
 * persist that observation across restarts without changing the originals' timestamps. A complete
 * directory listing is required; unavailable folders and in-flight work never authorize deletion.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProcessingFolderOriginalCleanup {

    private static final Duration RETENTION = Duration.ofDays(7);
    private static final Pattern MISSING_MARKER =
            Pattern.compile(
                    Pattern.quote(FolderOutputSink.MISSING_ORIGINAL_PREFIX)
                            + "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");

    private final PolicyStore policyStore;
    private final SourceStore sourceStore;
    private final FolderAccessGuard accessGuard;
    private final ProcessedLedger processedLedger;

    /** Pausing processing preserves the folder's ownership of its backups and their retention. */
    @Scheduled(fixedDelay = 300_000, initialDelay = 60_000)
    public void sweep() {
        sweep(Instant.now());
    }

    void sweep(Instant now) {
        Map<Path, Set<String>> directories = new HashMap<>();
        for (Policy policy : policyStore.all()) {
            if (Policy.SURFACE_PROCESSING_FOLDER.equals(policy.surface())) {
                for (String sourceId : policy.sourceIds()) {
                    var source = sourceStore.get(sourceId).orElse(null);
                    if (source != null && FolderAccessGuard.FOLDER_TYPE.equals(source.type())) {
                        registerDirectory(
                                directories, policy.id(), source.options().get("directory"));
                    }
                }
            }
            if (policy.outputIds().isEmpty()) {
                registerOutput(directories, policy.id(), policy.output());
            }
            for (String outputId : policy.allOutputIds()) {
                sourceStore
                        .get(outputId)
                        .ifPresent(
                                source ->
                                        registerOutput(
                                                directories, policy.id(), source.toOutputSpec()));
            }
        }
        for (var entry : directories.entrySet()) {
            try {
                synchronized (FolderOutputSink.originalLock(entry.getKey())) {
                    reconcile(entry.getKey(), entry.getValue(), now);
                }
            } catch (IOException | RuntimeException e) {
                log.debug("Original cleanup deferred for {}: {}", entry.getKey(), e.getMessage());
            }
        }
    }

    private void registerOutput(
            Map<Path, Set<String>> directories, String policyId, OutputSpec output) {
        if (FolderAccessGuard.FOLDER_TYPE.equals(output.type())
                && Boolean.parseBoolean(String.valueOf(output.options().get("replace")))) {
            registerDirectory(directories, policyId, output.options().get("directory"));
        }
    }

    private void registerDirectory(
            Map<Path, Set<String>> directories, String policyId, Object value) {
        if (!(value instanceof String directory) || directory.isBlank()) return;
        try {
            Path permitted = accessGuard.requirePermitted(Path.of(directory));
            Path canonical = FolderIdentities.canonicalDir(permitted);
            directories.computeIfAbsent(canonical, ignored -> new HashSet<>()).add(policyId);
        } catch (IOException | RuntimeException e) {
            log.debug("Original cleanup cannot access {}: {}", directory, e.getMessage());
        }
    }

    private void reconcile(Path dir, Set<String> policyIds, Instant now) throws IOException {
        Set<String> present;
        try (Stream<Path> entries = Files.list(dir)) {
            present =
                    entries.map(path -> path.getFileName().toString()).collect(Collectors.toSet());
        }
        Path workspace = FolderOutputSink.originalsDir(dir);
        if (!Files.isDirectory(workspace, NOFOLLOW_LINKS)) return;
        Map<String, List<Path>> originals = originals(workspace);
        Set<Path> markers = new HashSet<>();
        Set<String> processing =
                processingIdentities(
                        policyIds,
                        originals.keySet().stream()
                                .map(name -> dir.resolve(name).toString())
                                .toList());
        for (var entry : originals.entrySet()) {
            String name = entry.getKey();
            Path target = dir.resolve(name);
            Path marker = FolderOutputSink.missingOriginalMarker(dir, name);
            markers.add(marker);
            if (present.contains(name)
                    || !Files.notExists(target, NOFOLLOW_LINKS)
                    || processing.contains(target.toString())) {
                FolderOutputSink.clearOriginalExpiry(dir, name);
                continue;
            }
            String version = versionOf(workspace, entry.getValue());
            if (!Files.isRegularFile(marker, NOFOLLOW_LINKS)
                    || !Files.readString(marker).equals(version)
                    || Files.getLastModifiedTime(marker, NOFOLLOW_LINKS).toInstant().isAfter(now)) {
                Files.writeString(
                        marker,
                        version,
                        StandardOpenOption.CREATE,
                        StandardOpenOption.TRUNCATE_EXISTING,
                        StandardOpenOption.WRITE,
                        NOFOLLOW_LINKS);
                Files.setLastModifiedTime(marker, FileTime.from(now));
                continue;
            }
            Instant missingSince = Files.getLastModifiedTime(marker, NOFOLLOW_LINKS).toInstant();
            if (missingSince.isAfter(now.minus(RETENTION))) continue;
            if (!version.equals(versionOf(workspace, entry.getValue()))
                    || !processingIdentities(policyIds, List.of(target.toString())).isEmpty()
                    || !Files.notExists(target, NOFOLLOW_LINKS)) {
                FolderOutputSink.clearOriginalExpiry(dir, name);
                continue;
            }
            for (Path original : entry.getValue()) Files.deleteIfExists(original);
            Files.deleteIfExists(marker);
        }
        try (Stream<Path> entries = Files.list(workspace)) {
            for (Path marker :
                    entries.filter(path -> Files.isRegularFile(path, NOFOLLOW_LINKS))
                            .filter(
                                    path ->
                                            MISSING_MARKER
                                                    .matcher(path.getFileName().toString())
                                                    .matches())
                            .filter(path -> !markers.contains(path))
                            .toList()) {
                Files.deleteIfExists(marker);
            }
        }
    }

    private Set<String> processingIdentities(Set<String> policyIds, List<String> identities) {
        Set<String> processing = new HashSet<>();
        for (String policyId : policyIds) {
            processedLedger
                    .statesFor(policyId, identities)
                    .forEach(
                            (identity, state) -> {
                                if (state.status() == ProcessedFileStatus.PROCESSING)
                                    processing.add(identity);
                            });
        }
        return processing;
    }

    private static Map<String, List<Path>> originals(Path workspace) throws IOException {
        Map<String, List<Path>> originals =
                java.io.File.separatorChar == '\\'
                        ? new TreeMap<>(String.CASE_INSENSITIVE_ORDER)
                        : new TreeMap<>();
        for (Path archive : List.of(workspace, workspace.resolve("originals"))) {
            if (!Files.isDirectory(archive, NOFOLLOW_LINKS)) continue;
            try (Stream<Path> entries = Files.list(archive)) {
                for (Path original :
                        entries.filter(path -> Files.isRegularFile(path, NOFOLLOW_LINKS))
                                .filter(path -> FolderOutputSink.originalName(path) != null)
                                .toList()) {
                    originals
                            .computeIfAbsent(
                                    FolderOutputSink.originalName(original),
                                    ignored -> new ArrayList<>())
                            .add(original);
                }
            }
        }
        return originals;
    }

    private static String versionOf(Path workspace, List<Path> originals) throws IOException {
        StringJoiner version = new StringJoiner("\n");
        for (Path original : originals) {
            BasicFileAttributes attributes =
                    Files.readAttributes(original, BasicFileAttributes.class, NOFOLLOW_LINKS);
            version.add(
                    workspace.relativize(original)
                            + ":"
                            + attributes.fileKey()
                            + ":"
                            + attributes.creationTime()
                            + ":"
                            + attributes.lastModifiedTime()
                            + ":"
                            + attributes.size());
        }
        return version.toString();
    }
}
