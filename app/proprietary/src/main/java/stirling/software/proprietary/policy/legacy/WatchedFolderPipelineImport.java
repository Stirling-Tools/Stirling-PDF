package stirling.software.proprietary.policy.legacy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitOption;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.MigratedWatchedFolders;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.policy.trigger.PolicyTriggerManager;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.TeamService;

/**
 * Converts each legacy watched folder into an enabled, folder-watched policy so existing
 * drop-folder automations keep running. Converted once ever, tracked in {@link ImportedPipelines}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WatchedFolderPipelineImport implements MigratedWatchedFolders {

    private static final String IMPORT_KEY_PREFIX = "watched-folder:";

    /** Matches the legacy scanner's own recursion limit, so the same folders are found. */
    private static final int MAX_DEPTH = 50;

    /** The legacy scanner's staging directory, never a pipeline folder itself. */
    private static final String LEGACY_PROCESSING_DIR = "processing";

    private static final String ARCHIVE_DIR = ".stirling";
    private static final String ARCHIVE_SUBDIR = "migrated";
    private static final String FOLDER_TYPE = FolderAccessGuard.FOLDER_TYPE;
    private static final String FOLDER_WATCH_TRIGGER = "folder-watch";

    private final LegacyPipelineConverter converter;
    private final PolicyStore policyStore;
    private final SourceStore sourceStore;
    private final ImportedPipelines importedPipelines;
    private final PolicyTriggerManager policyTriggerManager;
    private final TeamRepository teamRepository;
    private final RuntimePathConfig runtimePathConfig;
    private final FolderAccessGuard folderAccessGuard;
    private final ToolMetadataService toolMetadataService;
    private final ApplicationProperties applicationProperties;

    @Override
    public boolean isMigrated(Path directory) {
        if (directory == null) {
            return false;
        }
        return importedPipelines.isImported(importKey(directory));
    }

    // After the inline-output and S3 migrations, so created sources match the shape those leave
    // behind. A folder that fails is logged and left to the legacy scanner, never failing the boot.
    @Order(3)
    @EventListener(ApplicationReadyEvent.class)
    public void importWatchedFolders() {
        try {
            convertWatchedFolders();
        } catch (Exception e) {
            // A ready-event listener that throws aborts SpringApplication.run; a cosmetic
            // migration must never be able to stop the app booting.
            log.error(
                    "Watched-folder conversion failed; leaving the folders to the legacy scanner",
                    e);
        }
    }

    private void convertWatchedFolders() {
        Long teamId = defaultTeamId();
        int imported = 0;
        for (String root : runtimePathConfig.getPipelineWatchedFoldersPaths()) {
            for (Path directory : pipelineDirectories(Path.of(root).toAbsolutePath())) {
                try {
                    if (importDirectory(directory, teamId)) {
                        imported++;
                    }
                } catch (Exception e) {
                    log.error(
                            "Could not convert watched folder {} into a policy; leaving it to the"
                                    + " legacy scanner: {}",
                            directory,
                            e.getMessage(),
                            e);
                }
            }
        }
        if (imported > 0) {
            log.info("Converted {} watched folder(s) into policies", imported);
            policyTriggerManager.notifyPoliciesChanged();
        }
    }

    /** Returns whether a policy was created for this directory. */
    private boolean importDirectory(Path directory, Long teamId) throws IOException {
        String key = importKey(directory);
        if (importedPipelines.isImported(key)) {
            return false;
        }
        Optional<Path> configFile = findConfig(directory);
        if (configFile.isEmpty()) {
            return false;
        }
        LegacyPipelineConfig config = converter.read(configFile.get());
        List<PipelineStep> steps = converter.toSteps(config);
        if (steps.isEmpty()) {
            log.warn("Watched folder {} has no operations to convert; skipping", directory);
            return false;
        }

        List<String> batchOperations = batchOperations(steps);
        if (!batchOperations.isEmpty() && !migrateBatchFolders()) {
            // TODO(#7413): convert these too once a folder-watch policy can run one batch over
            // every ready file instead of one run per file.
            log.warn(
                    "Watched folder {} feeds every ready file to {} in one call; a policy would run"
                            + " it once per file instead, so the folder is left to the legacy"
                            + " scanner. Set policies.migrateBatchWatchedFolders=true to convert it"
                            + " anyway, accepting per-file runs.",
                    directory,
                    String.join(", ", batchOperations));
            return false;
        }

        // The sink checks this on every delivery; converting a folder it would refuse just swaps a
        // working legacy automation for a pipeline that fails every run.
        Path outputDirectory = converter.resolveOutputDirectory(config, directory);
        try {
            folderAccessGuard.requirePermitted(outputDirectory);
        } catch (IllegalArgumentException notPermitted) {
            log.warn(
                    "Watched folder {} writes to {}, which folder access does not permit ({});"
                            + " leaving it to the legacy scanner",
                    directory,
                    outputDirectory,
                    notPermitted.getMessage());
            return false;
        }

        Source input = inputSourceFor(directory, teamId);
        Source destination = destinationSourceFor(config, directory, teamId);

        // Archived before the policy exists, because a saved policy is live from the folder-watch
        // reconcile's next sweep and the config left in place is a claimable input document.
        Optional<Path> archived = archiveConfig(configFile.get());
        if (archived.isEmpty()) {
            return false;
        }
        Policy converted =
                new Policy(
                                null,
                                policyName(config, directory),
                                // No acting principal: tool calls use the internal API user. A
                                // fabricated name fails every run at API-key lookup.
                                null,
                                true,
                                List.of(
                                        new PipelineInput(
                                                input.id(),
                                                new TriggerConfig(FOLDER_WATCH_TRIGGER, Map.of()))),
                                steps,
                                OutputSpec.inline(),
                                List.of(destination.id()),
                                teamId)
                        .withOrigin(Policy.ORIGIN_MIGRATED);
        Policy policy;
        try {
            policy = policyStore.save(converted);
        } catch (RuntimeException e) {
            restoreConfig(archived.get(), configFile.get());
            throw e;
        }

        importedPipelines.markImported(key);
        log.info(
                "Converted watched folder {} into policy '{}' ({} step(s))",
                directory,
                policy.name(),
                steps.size());
        return true;
    }

    /** Reuse a source already pointing at this folder, else create a consuming one. */
    private Source inputSourceFor(Path directory, Long teamId) {
        String path = directory.toString();
        // "consume" matches the legacy runner, which removed inputs once processed.
        Map<String, Object> options = Map.of("directory", path, "mode", "consume");
        return existingSource(options, teamId)
                .orElseGet(
                        () ->
                                sourceStore.save(
                                        new Source(
                                                null,
                                                folderName(directory),
                                                FOLDER_TYPE,
                                                options,
                                                true,
                                                null,
                                                teamId)));
    }

    /**
     * The destination the legacy config wrote to, as a stored location. A return-to-caller config
     * has no caller in a watched folder, so it lands in the finished-folders directory.
     */
    private Source destinationSourceFor(LegacyPipelineConfig config, Path directory, Long teamId) {
        Path outputDirectory = converter.resolveOutputDirectory(config, directory);
        String pattern = converter.resolveFilenamePattern(config);
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("directory", outputDirectory.toString());
        if (pattern != null) {
            options.put("filenamePattern", pattern);
        }
        return existingSource(options, teamId)
                .orElseGet(
                        () ->
                                sourceStore.save(
                                        new Source(
                                                null,
                                                // Distinguished from the input source, which
                                                // often shares the folder's leaf name.
                                                folderName(outputDirectory) + " (output)",
                                                FOLDER_TYPE,
                                                options,
                                                true,
                                                null,
                                                teamId)));
    }

    /**
     * An identical folder source already owned by this team. Team-scoped so a conversion never
     * binds to another team's location; matched on the whole option set, not just the directory.
     */
    private Optional<Source> existingSource(Map<String, Object> options, Long teamId) {
        return sourceStore.findByTeam(teamId).stream()
                .filter(source -> FOLDER_TYPE.equals(source.type()))
                .filter(source -> options.equals(new LinkedHashMap<>(source.options())))
                .findFirst();
    }

    /**
     * Move the legacy config aside, keeping it for reference, and return where it landed. Empty on
     * failure, which aborts the import: left in place the JSON would be fed to the pipeline as an
     * input document.
     */
    private static Optional<Path> archiveConfig(Path configFile) {
        Path parent = configFile.getParent();
        if (parent == null) {
            return Optional.empty();
        }
        try {
            Path archive = parent.resolve(ARCHIVE_DIR).resolve(ARCHIVE_SUBDIR);
            Files.createDirectories(archive);
            Path archived = archive.resolve(configFile.getFileName());
            Files.move(configFile, archived, StandardCopyOption.REPLACE_EXISTING);
            return Optional.of(archived);
        } catch (IOException e) {
            log.warn(
                    "Could not archive legacy config {}; leaving the folder to the legacy scanner:"
                            + " {}",
                    configFile,
                    e.getMessage());
            return Optional.empty();
        }
    }

    /** Hand the folder back to the legacy scanner when the conversion did not complete. */
    private static void restoreConfig(Path archived, Path configFile) {
        try {
            Files.move(archived, configFile, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            log.error(
                    "Could not restore legacy config {} from {}; the folder will no longer be"
                            + " processed: {}",
                    configFile,
                    archived,
                    e.getMessage());
        }
    }

    /** Every directory the legacy scanner would treat as a pipeline folder. */
    private static List<Path> pipelineDirectories(Path root) {
        if (!Files.isDirectory(root)) {
            return List.of();
        }
        List<Path> directories = new ArrayList<>();
        try {
            Files.walkFileTree(
                    root,
                    EnumSet.of(FileVisitOption.FOLLOW_LINKS),
                    MAX_DEPTH,
                    new SimpleFileVisitor<>() {
                        @Override
                        public FileVisitResult preVisitDirectory(
                                Path dir, BasicFileAttributes attributes) {
                            Path name = dir.getFileName();
                            String directoryName = name == null ? "" : name.toString();
                            if (LEGACY_PROCESSING_DIR.equals(directoryName)
                                    || directoryName.startsWith(".")) {
                                return FileVisitResult.SKIP_SUBTREE;
                            }
                            if (!dir.equals(root)) {
                                directories.add(dir);
                            }
                            return FileVisitResult.CONTINUE;
                        }

                        @Override
                        public FileVisitResult visitFileFailed(Path path, IOException e) {
                            log.debug("Skipping unreadable watched path {}: {}", path, e);
                            return FileVisitResult.CONTINUE;
                        }
                    });
        } catch (IOException e) {
            log.error("Could not scan watched folder root {}: {}", root, e.getMessage());
        }
        return directories;
    }

    /** The config the legacy scanner would have picked: the first JSON directly in the folder. */
    private static Optional<Path> findConfig(Path directory) throws IOException {
        try (Stream<Path> entries = Files.list(directory)) {
            return entries.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().endsWith(".json"))
                    .sorted()
                    .findFirst();
        }
    }

    /**
     * Stable across boots, whatever the configured path looked like. Hashed because the path is
     * unbounded and the marker is a primary key of {@link ImportedPipeline#MAX_KEY_LENGTH} chars;
     * an overflowing key would fail the insert and leave the folder converted on every boot.
     */
    private static String importKey(Path directory) {
        String path = directory.toAbsolutePath().normalize().toString();
        try {
            byte[] digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest(path.getBytes(StandardCharsets.UTF_8));
            return IMPORT_KEY_PREFIX + HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required to track converted folders", e);
        }
    }

    /** The operations that take every ready file in one call rather than one file per run. */
    private List<String> batchOperations(List<PipelineStep> steps) {
        return steps.stream()
                .map(PipelineStep::operation)
                .filter(toolMetadataService::isMultiInput)
                .distinct()
                .toList();
    }

    private boolean migrateBatchFolders() {
        return applicationProperties.getPolicies().isMigrateBatchWatchedFolders();
    }

    private static String policyName(LegacyPipelineConfig config, Path directory) {
        String name = config.name();
        return name == null || name.isBlank() ? folderName(directory) : name;
    }

    private static String folderName(Path directory) {
        Path name = directory.getFileName();
        return name == null ? directory.toString() : name.toString();
    }

    /** Server-level config has no creating user, so it lands on the default team. */
    private Long defaultTeamId() {
        return teamRepository
                .findByName(TeamService.DEFAULT_TEAM_NAME)
                .map(team -> team.getId())
                .orElse(null);
    }
}
