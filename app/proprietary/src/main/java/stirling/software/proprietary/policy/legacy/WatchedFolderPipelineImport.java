package stirling.software.proprietary.policy.legacy;

import java.io.IOException;
import java.nio.file.FileVisitOption;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.EnumSet;
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
import stirling.software.common.service.MigratedWatchedFolders;
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
 * Converts each legacy watched folder into a live policy: the folder becomes a consuming input
 * source, its JSON config's operations become the pipeline steps, its {@code outputDir} becomes a
 * destination source, and a folder-watch trigger takes over from the legacy 60-second scan. The
 * result is enabled, so an operator's existing drop-folder automations keep running without being
 * re-created by hand.
 *
 * <p>Each folder is imported at most once ever, tracked in {@link ImportedPipelines}: deleting the
 * policy afterwards is permanent even though the JSON is still on disk. The config file is moved
 * into a hidden {@code .stirling/migrated} directory beside it, which both keeps it out of the new
 * input source's document stream and stops the legacy scanner finding anything to do; {@link
 * #isMigrated} closes the remaining gap by telling that scanner to leave the folder alone.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WatchedFolderPipelineImport implements MigratedWatchedFolders {

    private static final String IMPORT_KEY_PREFIX = "watched-folder:";

    /** Matches the legacy scanner's own recursion limit, so the same folders are found. */
    private static final int MAX_DEPTH = 50;

    /** The legacy scanner's staging directory; never a pipeline folder in its own right. */
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

    @Override
    public boolean isMigrated(Path directory) {
        if (directory == null) {
            return false;
        }
        return importedPipelines.isImported(importKey(directory));
    }

    // Runs after the inline-output and S3-credential migrations so the sources it creates match the
    // shape those have already normalised existing policies onto. Each folder is its own unit of
    // work: one that fails is logged and left to the legacy scanner rather than failing the boot.
    @Order(3)
    @EventListener(ApplicationReadyEvent.class)
    public void importWatchedFolders() {
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

    /**
     * @return whether a policy was created for this directory.
     */
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

        Source input = inputSourceFor(directory, teamId);
        Source destination = destinationSourceFor(config, directory, teamId);
        Policy policy =
                policyStore.save(
                        new Policy(
                                null,
                                policyName(config, directory),
                                // No creating user: a watched folder is server configuration. The
                                // engine treats a null owner as "no acting principal" and its tool
                                // calls fall back to the internal API user, which is what a
                                // trigger-fired run with no logged-in caller needs. A fabricated
                                // name here would fail every run at API-key lookup.
                                null,
                                true,
                                List.of(
                                        new PipelineInput(
                                                input.id(),
                                                new TriggerConfig(FOLDER_WATCH_TRIGGER, Map.of()))),
                                steps,
                                OutputSpec.inline(),
                                List.of(destination.id()),
                                teamId,
                                Policy.ORIGIN_MIGRATED));

        // The config must stop being visible to both runners before the policy goes live, or the
        // new input source would hand its own JSON to the pipeline as a document.
        if (!archiveConfig(configFile.get())) {
            policyStore.delete(policy.id());
            return false;
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
     * The destination the legacy config wrote to, as a stored location. A config that returned its
     * results to the caller has no such location in a watched folder - there is no caller - so it
     * lands in the finished-folders directory, which is where the legacy runner put everything
     * else.
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
     * An identically-configured folder source already owned by this team, so a re-imported location
     * is configured once. Scoped to the team so a conversion can never bind to another team's
     * location, and matched on the whole option set so a plain input source is not silently reused
     * as a destination that renames what it writes.
     */
    private Optional<Source> existingSource(Map<String, Object> options, Long teamId) {
        return sourceStore.findByTeam(teamId).stream()
                .filter(source -> FOLDER_TYPE.equals(source.type()))
                .filter(source -> options.equals(new LinkedHashMap<>(source.options())))
                .findFirst();
    }

    /**
     * Move the legacy config out of the pipeline folder, keeping it for reference. Failure is not
     * an error to shout about but it does abort the import, since leaving it in place would feed
     * the JSON to the pipeline as an input document.
     */
    private static boolean archiveConfig(Path configFile) {
        Path parent = configFile.getParent();
        if (parent == null) {
            return false;
        }
        try {
            Path archive = parent.resolve(ARCHIVE_DIR).resolve(ARCHIVE_SUBDIR);
            Files.createDirectories(archive);
            Files.move(
                    configFile,
                    archive.resolve(configFile.getFileName()),
                    StandardCopyOption.REPLACE_EXISTING);
            return true;
        } catch (IOException e) {
            log.warn(
                    "Could not archive legacy config {}; leaving the folder to the legacy scanner:"
                            + " {}",
                    configFile,
                    e.getMessage());
            return false;
        }
    }

    /**
     * Every directory the legacy scanner would treat as a pipeline folder: the whole watched tree
     * except the root itself and the scanner's own staging directories.
     */
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

    /** Stable across boots and independent of how the path was spelled in configuration. */
    private static String importKey(Path directory) {
        return IMPORT_KEY_PREFIX + directory.toAbsolutePath().normalize();
    }

    private static String policyName(LegacyPipelineConfig config, Path directory) {
        String name = config.name();
        return name == null || name.isBlank() ? folderName(directory) : name;
    }

    private static String folderName(Path directory) {
        Path name = directory.getFileName();
        return name == null ? directory.toString() : name.toString();
    }

    /**
     * Watched folders are server-level configuration with no creating user, so their policies are
     * stamped with the default team. Null when no team exists, which is the login-disabled case
     * where team scoping is not enforced anyway.
     */
    private Long defaultTeamId() {
        return teamRepository
                .findByName(TeamService.DEFAULT_TEAM_NAME)
                .map(team -> team.getId())
                .orElse(null);
    }
}
