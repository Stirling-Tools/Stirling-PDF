package stirling.software.proprietary.policy.controller;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Stream;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.PolicyValidator;
import stirling.software.proprietary.policy.engine.SweepKind;
import stirling.software.proprietary.policy.engine.SweepOutcome;
import stirling.software.proprietary.policy.ledger.ClaimState;
import stirling.software.proprietary.policy.ledger.FolderIdentities;
import stirling.software.proprietary.policy.ledger.ProcessedFileStatus;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.ledger.StorageFileIdentities;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.output.FolderOutputSink;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.policy.trigger.PolicyTriggerManager;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FilePurpose;
import stirling.software.proprietary.storage.model.Folder;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.storage.service.FileStorageService;

/**
 * Processing folders: a storage folder with a pipeline attached, so any file that lands in it is
 * processed. One processing folder is a pair of records — a {@code storage-folder} source and a
 * policy — composed and torn down together here so neither can exist half-configured. The pair is
 * marked with {@link #SURFACE} and served only by this route: the portal's policies and pipelines
 * surfaces filter it out, and this route serves nothing else.
 *
 * <p>Unlike org policies this is a personal, per-user feature: any authenticated user may create
 * processing folders on folders they own; there is no team-leader gate. Records are still stamped
 * with the caller's team so the engine's scoping holds.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/processing-folders")
@RequiredArgsConstructor
@Tag(name = "Processing Folders", description = "Folders that process any file added to them.")
public class ProcessingFolderController {

    /** Legacy marker in output options; pre-surface-field rows carry it, and reads strip it. */
    public static final String SURFACE_OPTION = "surface";

    public static final String SURFACE = Policy.SURFACE_PROCESSING_FOLDER;

    /** The paired source's type; the policies/pipelines surfaces hide sources of this type too. */
    public static final String SOURCE_TYPE = "storage-folder";

    /** A processing folder over a directory on the server's disk (desktop / self-hosted). */
    static final String DISK_SOURCE_TYPE = FolderAccessGuard.FOLDER_TYPE;

    /**
     * How many files one sweep of a disk-backed folder takes on. A Downloads directory can hold
     * thousands; the cap keeps a first run bounded and predictable, and everything beyond it keeps
     * its place in the ledger and is picked up by later sweeps rather than dropped.
     */
    static final int DISK_SWEEP_LIMIT = 100;

    /** The trigger that watches a directory for arrivals. */
    static final String WATCH_TRIGGER = "folder-watch";

    private final PolicyStore policyStore;
    private final SourceStore sourceStore;
    private final PolicyValidator policyValidator;
    private final PolicyRunner policyRunner;
    private final PolicyTriggerManager policyTriggerManager;
    private final ProcessedLedger processedLedger;
    private final FolderRepository folderRepository;
    private final StoredFileRepository storedFileRepository;
    private final FileStorageService fileStorageService;
    private final PolicyAccessGuard policyAccessGuard;
    private final FolderAccessGuard folderAccessGuard;
    private final ApplicationProperties applicationProperties;

    /** What a processing folder looks like to the editor client. */
    public record ProcessingFolderView(
            String id,
            String folderId,
            String directory,
            String name,
            boolean enabled,
            List<PipelineStep> steps,
            Map<String, Object> output,
            /** Runs the creating sweep started; 0 means there was nothing new to process. */
            int startedRuns,
            /** Files the sweep skipped because this folder had already processed them. */
            int alreadyProcessed,
            /** Files skipped because an earlier run failed on them and they stayed parked. */
            int parked,
            /** Files the sweep took on again after an earlier failure. */
            int retried) {}

    /**
     * Create/update payload. A null id creates; a present id updates the caller's own record.
     * Exactly one of {@code folderId} (a folder in app storage) or {@code directory} (a directory
     * on the server's disk — on a desktop or self-hosted install, the user's own machine) says
     * where the folder watches.
     */
    public record SaveProcessingFolderRequest(
            String id,
            String folderId,
            String directory,
            Boolean enabled,
            List<PipelineStep> steps,
            Map<String, Object> output) {}

    /**
     * What the Downloads offer should say. The browser cannot see the machine's paths, so the
     * server names its own Downloads directory and counts what is waiting there.
     */
    public record DownloadsSuggestion(
            String directory, boolean available, int pdfCount, int limit) {}

    @GetMapping("/downloads-suggestion")
    @Operation(
            summary = "The server's Downloads directory and how many PDFs are waiting in it",
            description =
                    "Backs the offer to process a user's Downloads. `available` is false when the"
                            + " directory does not exist or is outside the permitted folder roots,"
                            + " so the offer is never made where it could only fail.")
    public DownloadsSuggestion downloadsSuggestion() {
        currentUserOrNull();
        Path downloads = Path.of(System.getProperty("user.home", ""), "Downloads");
        if (!Files.isDirectory(downloads)) {
            return new DownloadsSuggestion(downloads.toString(), false, 0, DISK_SWEEP_LIMIT);
        }
        try {
            folderAccessGuard.requirePermitted(downloads);
        } catch (RuntimeException notPermitted) {
            return new DownloadsSuggestion(downloads.toString(), false, 0, DISK_SWEEP_LIMIT);
        }
        int pdfCount = 0;
        try (Stream<Path> entries = Files.list(downloads)) {
            pdfCount =
                    (int)
                            entries.filter(Files::isRegularFile)
                                    .filter(
                                            path ->
                                                    path.getFileName()
                                                            .toString()
                                                            .toLowerCase(Locale.ROOT)
                                                            .endsWith(".pdf"))
                                    .limit(DISK_SWEEP_LIMIT * 10L)
                                    .count();
        } catch (IOException e) {
            log.debug("Could not count PDFs in {}: {}", downloads, e.getMessage());
        }
        return new DownloadsSuggestion(downloads.toString(), true, pdfCount, DISK_SWEEP_LIMIT);
    }

    @GetMapping
    @Operation(summary = "List the caller's processing folders")
    public List<ProcessingFolderView> list() {
        currentUserOrNull();
        return policyAccessGuard.visibleProcessingFolders(policyStore).stream()
                .map(this::toView)
                .toList();
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Create or update a processing folder",
            description =
                    "Composes the folder's source + pipeline pair, validated like any policy save."
                            + " Creating one immediately processes the folder's existing files (the"
                            + " ledger keeps already-processed files from re-running).")
    public ResponseEntity<ProcessingFolderView> save(
            @RequestBody SaveProcessingFolderRequest request) {
        User user = currentUserOrNull();
        boolean onDisk = request.directory() != null && !request.directory().isBlank();
        if (onDisk == (request.folderId() != null && !request.folderId().isBlank())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "a processing folder needs either a folderId or a directory, not both");
        }
        Folder folder = onDisk ? null : requireOwnedFolder(request.folderId(), user);
        boolean requestedCreate = request.id() == null || request.id().isBlank();
        // A place carries at most one processing folder per user: a create against a place that
        // already has one adopts it — same policy, same ledger — instead of composing a duplicate
        // pair whose empty ledger would re-process everything the original already did. The
        // adopted create still runs the backlog sweep below; the kept ledger makes it pick up
        // only what is genuinely new.
        Policy existing =
                requestedCreate ? existingForPlace(request, user) : requireOwn(request.id(), user);
        String name = onDisk ? diskFolderName(request.directory()) : folder.getName();

        // Held for rollback: the source is written before the policy validates, and a rejected
        // save must not leave the pair half-updated (source mutated, policy old).
        String existingSourceId = existing == null ? null : soleSourceId(existing);
        Source priorSource =
                existingSourceId == null ? null : sourceStore.get(existingSourceId).orElse(null);

        Source source =
                sourceStore.save(
                        new Source(
                                existing == null ? null : soleSourceId(existing),
                                name,
                                onDisk ? DISK_SOURCE_TYPE : SOURCE_TYPE,
                                onDisk
                                        ? diskSourceOptions(request.directory())
                                        : Map.of("folderId", folder.getId().toString()),
                                request.enabled() == null || request.enabled(),
                                policyAccessGuard.ownerForNewPolicy(),
                                policyAccessGuard.teamForNewPolicy()));
        Policy policy =
                new Policy(
                                existing == null ? null : existing.id(),
                                "Processing folder: " + name,
                                policyAccessGuard.ownerForNewPolicy(),
                                request.enabled() == null || request.enabled(),
                                // A disk directory is watched, so the folder reacts to arrivals on
                                // its own.
                                // A null trigger would make the input manual-only: the create-time
                                // backlog
                                // sweep would run and nothing would ever process again.
                                // Storage-backed
                                // folders stay manual until the storage arrival trigger exists —
                                // folder-watch only supports directory sources.
                                List.of(
                                        new PipelineInput(
                                                source.id(),
                                                onDisk
                                                        ? new TriggerConfig(WATCH_TRIGGER, Map.of())
                                                        : null)),
                                request.steps() == null ? List.of() : request.steps(),
                                outputSpecFor(request, folder),
                                List.of(),
                                policyAccessGuard.teamForNewPolicy(),
                                null)
                        .withSurface(SURFACE);
        try {
            policyValidator.validate(policy);
        } catch (IllegalArgumentException e) {
            if (existing == null) {
                sourceStore.delete(source.id());
            } else if (priorSource != null) {
                sourceStore.save(priorSource);
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        Policy saved = policyStore.save(policy);
        policyTriggerManager.notifyPoliciesChanged();
        if (!requestedCreate) {
            return ResponseEntity.ok(toView(saved));
        }
        // Process the backlog: everything already in the folder runs once, now. The counts go back
        // to the caller so a client can report real progress — and can tell "nothing new to do"
        // apart from "work started", instead of waiting for runs that were never going to appear.
        SweepOutcome outcome = policyRunner.run(saved, SweepKind.USER);
        log.debug(
                "Processing folder {} created; backlog sweep started {} runs ({} already processed,"
                        + " {} listed)",
                saved.id(),
                outcome.runIds().size(),
                outcome.alreadyProcessed(),
                outcome.filesListed());
        return ResponseEntity.ok(
                toView(
                        saved,
                        outcome.runIds().size(),
                        outcome.alreadyProcessed(),
                        outcome.parked(),
                        outcome.retried()));
    }

    /** One file in a mounted directory, as the file manager needs to list it. */
    public record MountedFileView(
            String name,
            long sizeBytes,
            long lastModified,
            /** Its place in the folder's pipeline: done, processing, failed, or waiting. */
            String state,
            /** Whether a pre-processing original is archived and can be restored. */
            boolean hasOriginal) {}

    @GetMapping("/{id}/files")
    @Operation(
            summary = "List a processing folder's files with their pipeline state",
            description =
                    "A disk-backed folder reads the directory itself — nothing is mirrored"
                            + " into app storage. A storage-backed folder lists its stored"
                            + " files. Both carry each file's place in the pipeline, from the"
                            + " ledger.")
    public List<MountedFileView> files(@PathVariable String id) {
        User user = currentUserOrNull();
        Policy policy = requireOwn(id, user);
        Path directory = watchedDirectory(policy);
        if (directory == null) {
            return storageFiles(policy);
        }
        // Re-check on read: the permitted roots may have narrowed since the folder was created.
        Path permitted = folderAccessGuard.requirePermitted(directory);
        try (Stream<Path> entries = Files.list(permitted)) {
            List<Path> files =
                    entries.filter(Files::isRegularFile)
                            .filter(path -> !path.getFileName().toString().startsWith("."))
                            .toList();
            // The ledger is the per-file truth: processed in place leaves nothing else to
            // read a file's state from.
            Path canonicalDir = FolderIdentities.canonicalDir(permitted);
            Map<String, ClaimState> states =
                    processedLedger.statesFor(
                            policy.id(),
                            files.stream()
                                    .map(f -> FolderIdentities.identity(canonicalDir, permitted, f))
                                    .toList());
            Path originals = FolderOutputSink.originalsDir(canonicalDir);
            return files.stream()
                    .map(
                            f ->
                                    toMountedFile(
                                            f,
                                            states.get(
                                                    FolderIdentities.identity(
                                                            canonicalDir, permitted, f)),
                                            Files.isRegularFile(
                                                    originals.resolve(f.getFileName().toString()))))
                    .filter(Objects::nonNull)
                    .toList();
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Could not read " + permitted + ": " + e.getMessage());
        }
    }

    private static MountedFileView toMountedFile(Path path, ClaimState state, boolean hasOriginal) {
        try {
            return new MountedFileView(
                    path.getFileName().toString(),
                    Files.size(path),
                    Files.getLastModifiedTime(path).toMillis(),
                    stateLabel(state),
                    hasOriginal);
        } catch (IOException vanished) {
            return null; // listed then removed; the next read tells the truth
        }
    }

    /** The client-facing name of a ledger state; no row means the file is still waiting. */
    private static String stateLabel(ClaimState state) {
        if (state == null) {
            return "waiting";
        }
        return switch (state.status()) {
            case DONE -> "done";
            case ERROR -> "failed";
            case PROCESSING, INTERRUPTED -> "processing";
        };
    }

    /**
     * A storage-backed folder's files, joined to the ledger the same way the disk listing is. The
     * stored files themselves are what the client already lists; this adds where each one stands in
     * the folder's pipeline, keyed by the identity the storage source claims by.
     */
    private List<MountedFileView> storageFiles(Policy policy) {
        UUID folderId = storageFolderId(policy);
        if (folderId == null) {
            return List.of();
        }
        List<StoredFile> files =
                storedFileRepository.findAllByFolderId(folderId).stream()
                        .filter(
                                file ->
                                        file.getPurpose() == null
                                                || file.getPurpose() == FilePurpose.GENERIC)
                        .toList();
        Map<String, ClaimState> states =
                processedLedger.statesFor(
                        policy.id(), files.stream().map(StorageFileIdentities::identity).toList());
        return files.stream()
                .map(
                        file ->
                                new MountedFileView(
                                        file.getOriginalFilename(),
                                        file.getSizeBytes(),
                                        lastModifiedMillis(file),
                                        stateLabel(
                                                states.get(StorageFileIdentities.identity(file))),
                                        false))
                .toList();
    }

    private static long lastModifiedMillis(StoredFile file) {
        LocalDateTime updatedAt = file.getUpdatedAt();
        return updatedAt == null
                ? 0
                : updatedAt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    /** The storage folder a storage-backed processing folder watches; null when disk-backed. */
    private UUID storageFolderId(Policy policy) {
        String sourceId = soleSourceId(policy);
        if (sourceId == null) {
            return null;
        }
        Object raw =
                sourceStore
                        .get(sourceId)
                        .filter(source -> SOURCE_TYPE.equals(source.type()))
                        .map(source -> source.options().get("folderId"))
                        .orElse(null);
        if (raw == null) {
            return null;
        }
        try {
            return UUID.fromString(String.valueOf(raw));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** The disk directory a processing folder watches, or null when it is storage-backed. */
    private Path watchedDirectory(Policy policy) {
        String sourceId = soleSourceId(policy);
        if (sourceId == null) {
            return null;
        }
        return sourceStore
                .get(sourceId)
                .filter(source -> DISK_SOURCE_TYPE.equals(source.type()))
                .map(source -> source.options().get("directory"))
                .filter(Objects::nonNull)
                .map(directory -> Path.of(directory.toString()))
                .orElse(null);
    }

    @PostMapping("/{id}/sweep")
    @Operation(summary = "Run the folder's pipeline against its current contents now")
    public ResponseEntity<SweepOutcome> sweep(@PathVariable String id) {
        User user = currentUserOrNull();
        Policy policy = requireOwn(id, user);
        return ResponseEntity.accepted().body(policyRunner.run(policy, SweepKind.USER));
    }

    /** Per-file retry: the name of the failed file within the folder. */
    public record RetryFileRequest(String name) {}

    @PostMapping("/{id}/files/retry")
    @Operation(
            summary = "Retry one failed file",
            description =
                    "Forgets the file's parked failure so it reads as never processed, then"
                            + " sweeps so it runs again now. Only the named file is retried:"
                            + " the sweep is a light one, which leaves every other parked"
                            + " failure parked.")
    public ResponseEntity<SweepOutcome> retryFile(
            @PathVariable String id, @RequestBody RetryFileRequest request) {
        User user = currentUserOrNull();
        Policy policy = requireOwn(id, user);
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "a file name is required");
        }
        String name = request.name().trim();
        String identity = identityForName(policy, name);
        if (identity == null || !processedLedger.forgetFailure(policy.id(), identity)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "'" + name + "' has no failure to retry");
        }
        // LIGHT, not USER: the forgotten row makes this one file claimable as new work, and a
        // light sweep leaves every other parked failure parked — retrying all of them is
        // the user-invoked sweep's job, not this file's.
        return ResponseEntity.accepted().body(policyRunner.run(policy, SweepKind.LIGHT));
    }

    /** Restore request: the file's name within the folder. */
    public record RevertFileRequest(String name) {}

    @PostMapping("/{id}/files/revert")
    @Operation(
            summary = "Restore a file's archived original",
            description =
                    "Moves the pre-processing original kept under .stirling/originals back"
                            + " over the processed file, and settles the ledger at the"
                            + " restored version so the folder holds the original instead of"
                            + " immediately re-processing it. Disk-backed folders only:"
                            + " storage-backed replacement keeps no original.")
    public MountedFileView revertFile(
            @PathVariable String id, @RequestBody RevertFileRequest request) {
        User user = currentUserOrNull();
        Policy policy = requireOwn(id, user);
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "a file name is required");
        }
        String name = request.name().trim();
        Path directory = watchedDirectory(policy);
        if (directory == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "only a disk-backed folder keeps originals");
        }
        Path permitted = folderAccessGuard.requirePermitted(directory);
        Path target = permitted.resolve(name).normalize();
        if (!permitted.equals(target.getParent())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such file: " + name);
        }
        try {
            Path canonicalDir = FolderIdentities.canonicalDir(permitted);
            Path archived = FolderOutputSink.originalsDir(canonicalDir).resolve(name);
            if (!Files.isRegularFile(archived)) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT, "'" + name + "' has no original to restore");
            }
            if (!restoreOriginal(policy, permitted, canonicalDir, name)) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT, "'" + name + "' is being processed right now");
            }
            return toMountedFile(
                    target, new ClaimState(ProcessedFileStatus.DONE, null, null), false);
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Could not restore " + name + ": " + e.getMessage());
        }
    }

    /** Outcome of a folder-wide restore: originals brought back, and files left as-is. */
    public record RevertAllOutcome(int restored, int skipped) {}

    @PostMapping("/{id}/files/revert-all")
    @Operation(
            summary = "Restore every archived original in the folder",
            description =
                    "Moves each original kept under .stirling/originals back over its"
                            + " processed file. Only files of the watched directory itself"
                            + " are touched — the archive never holds anything else — and a"
                            + " file mid-run is skipped rather than raced.")
    public RevertAllOutcome revertAllFiles(@PathVariable String id) {
        User user = currentUserOrNull();
        Policy policy = requireOwn(id, user);
        Path directory = watchedDirectory(policy);
        if (directory == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "only a disk-backed folder keeps originals");
        }
        Path permitted = folderAccessGuard.requirePermitted(directory);
        try {
            Path canonicalDir = FolderIdentities.canonicalDir(permitted);
            Path originals = FolderOutputSink.originalsDir(canonicalDir);
            if (!Files.isDirectory(originals)) {
                return new RevertAllOutcome(0, 0);
            }
            List<String> names;
            try (Stream<Path> entries = Files.list(originals)) {
                names =
                        entries.filter(Files::isRegularFile)
                                .map(entry -> entry.getFileName().toString())
                                .toList();
            }
            int restored = 0;
            int skipped = 0;
            for (String name : names) {
                if (restoreOriginal(policy, permitted, canonicalDir, name)) {
                    restored++;
                } else {
                    skipped++;
                }
            }
            return new RevertAllOutcome(restored, skipped);
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Could not restore originals: " + e.getMessage());
        }
    }

    /**
     * Move one archived original back over its processed file and settle the ledger at the restored
     * version, so the folder holds the original instead of re-processing it. False when the file is
     * mid-run — the run's output would immediately stamp the restore — or when the name resolves
     * outside the watched directory.
     */
    private boolean restoreOriginal(Policy policy, Path permitted, Path canonicalDir, String name)
            throws IOException {
        Path target = permitted.resolve(name).normalize();
        if (!permitted.equals(target.getParent())) {
            return false;
        }
        Path archived = FolderOutputSink.originalsDir(canonicalDir).resolve(name);
        String identity = FolderIdentities.identity(canonicalDir, permitted, target);
        ClaimState state = processedLedger.statesFor(policy.id(), List.of(identity)).get(identity);
        if (state != null && state.status() == ProcessedFileStatus.PROCESSING) {
            return false;
        }
        Files.move(
                archived,
                target,
                StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING);
        processedLedger.settle(
                policy.id(), identity, FolderIdentities.statGate(target), null, true);
        return true;
    }

    /** The ledger identity of a named file in this folder; null when no such file is listed. */
    private String identityForName(Policy policy, String name) {
        Path directory = watchedDirectory(policy);
        if (directory == null) {
            UUID folderId = storageFolderId(policy);
            if (folderId == null) {
                return null;
            }
            return storedFileRepository.findAllByFolderId(folderId).stream()
                    .filter(file -> name.equals(file.getOriginalFilename()))
                    .map(StorageFileIdentities::identity)
                    .findFirst()
                    .orElse(null);
        }
        Path permitted = folderAccessGuard.requirePermitted(directory);
        Path file = permitted.resolve(name).normalize();
        // A name addresses a single entry of the watched directory; anything resolving
        // elsewhere (traversal, an absolute path) is not a file this folder lists.
        if (!permitted.equals(file.getParent())) {
            return null;
        }
        try {
            return FolderIdentities.identity(
                    FolderIdentities.canonicalDir(permitted), permitted, file);
        } catch (IOException e) {
            return null;
        }
    }

    @DeleteMapping("/{id}")
    @Operation(
            summary = "Delete a processing folder",
            description =
                    "Removes the pipeline and its source. The storage folder and every file in it"
                            + " are untouched.")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        User user = currentUserOrNull();
        Policy policy = requireOwn(id, user);
        policyStore.delete(policy.id());
        policy.inputs().stream().map(PipelineInput::sourceId).forEach(sourceStore::delete);
        processedLedger.clearPolicy(policy.id());
        policyTriggerManager.notifyPoliciesChanged();
        return ResponseEntity.noContent().build();
    }

    /**
     * The caller's processing folder already watching the requested place, if any. Paths compare
     * normalized (and by the platform's own case rules), so the same directory spelled two ways is
     * still one place.
     */
    private Policy existingForPlace(SaveProcessingFolderRequest request, User user) {
        boolean onDisk = request.directory() != null && !request.directory().isBlank();
        Path directory = onDisk ? Path.of(request.directory().trim()).normalize() : null;
        return policyAccessGuard.visibleProcessingFolders(policyStore).stream()
                .filter(
                        policy -> {
                            String sourceId = soleSourceId(policy);
                            Source source =
                                    sourceId == null
                                            ? null
                                            : sourceStore.get(sourceId).orElse(null);
                            if (source == null) {
                                return false;
                            }
                            if (onDisk) {
                                Object watched = source.options().get("directory");
                                return watched != null
                                        && Path.of(watched.toString())
                                                .normalize()
                                                .equals(directory);
                            }
                            return String.valueOf(source.options().get("folderId"))
                                    .equals(request.folderId());
                        })
                .findFirst()
                .orElse(null);
    }

    /** The pair's policy record, only if it is a processing folder the caller owns. */
    private Policy requireOwn(String id, User user) {
        return policyStore
                .get(id)
                .filter(policyAccessGuard::canAccess)
                .filter(ProcessingFolderController::isProcessingFolder)
                .filter(policy -> ownedBy(policy, user))
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND, "No processing folder: " + id));
    }

    /** The storage folder, only if the caller owns it — the authorization boundary here. */
    private Folder requireOwnedFolder(String rawFolderId, User user) {
        UUID folderId;
        try {
            folderId = UUID.fromString(String.valueOf(rawFolderId));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "a processing folder needs a folderId");
        }
        Folder folder =
                folderRepository
                        .findById(folderId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "No folder: " + rawFolderId));
        if (folder.getOwner() == null || !Objects.equals(folder.getOwner().getId(), user.getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No folder: " + rawFolderId);
        }
        return folder;
    }

    /**
     * Per-user ownership on top of the guard's team scoping: processing folders are personal, so a
     * teammate's records are invisible here even though the engine treats them as team records.
     * Login disabled (null owner) matches everything.
     */
    private static boolean ownedBy(Policy policy, User user) {
        if (user == null) {
            // No accounts on this install: the local operator owns everything.
            return true;
        }
        return policy.owner() == null || Objects.equals(policy.owner(), user.getUsername());
    }

    /**
     * The caller, or null on an install with no accounts (desktop, single-user self-host), where
     * there is no principal to demand and the local operator is the only user. Mirrors {@link
     * PolicyAccessGuard#ownerForNewPolicy()}, which stamps a null owner in the same case —
     * requiring a principal here would make the whole surface 401 on those installs.
     */
    private User currentUserOrNull() {
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return null;
        }
        return fileStorageService.requireAuthenticatedUser();
    }

    /** The pair's source id; the compose invariant is exactly one source per processing folder. */
    private static String soleSourceId(Policy policy) {
        return policy.inputs().isEmpty() ? null : policy.inputs().get(0).sourceId();
    }

    /** Whether a policy record belongs to this surface (and so is hidden from the others). */
    public static boolean isProcessingFolder(Policy policy) {
        return SURFACE.equals(policy.surface());
    }

    /**
     * A processing folder never consumes its input directory. The user owns that folder — their
     * Downloads, a scanner drop — so the source is pinned to {@code track}: claim each file once
     * per version through the ledger and leave it exactly where they put it. The disk source's
     * default mode deletes processed files, which must never be what a processing folder does.
     */
    private static Map<String, Object> diskSourceOptions(String directory) {
        return Map.of(
                "directory",
                directory.trim(),
                "mode",
                "track",
                // Stat identity, not hash: the first sweep would otherwise content-hash every
                // file in the directory before a single run starts, and the user is watching.
                // A re-touched file reprocessing is the right trade for a folder someone owns.
                "identity",
                "stat",
                "recursive",
                false,
                // Only documents the pipeline can accept: a Downloads folder is full of zips and
                // installers, and each one would otherwise burn sweep budget on a doomed run.
                "extensions",
                List.of(".pdf"),
                "limit",
                DISK_SWEEP_LIMIT);
    }

    /** The trailing path segment ("Downloads"), or the raw path when it has none. */
    private static String diskFolderName(String directory) {
        Path path = Path.of(directory.trim());
        Path fileName = path.getFileName();
        return fileName == null ? path.toString() : fileName.toString();
    }

    /**
     * Where results go. Both kinds process in place: a storage-backed folder writes new versions
     * over its stored files, and a disk-backed one replaces the watched file with its result — the
     * folder's contents simply become their processed selves. The sink records each replacement in
     * the ledger at the result's version, and the input source settles its claim the same way, so a
     * sweep never mistakes the folder's own output for new work.
     *
     * <p>Writing to disk rather than app storage is what makes this work on an install with no
     * accounts and no file storage — a desktop app, where the server is the user's own machine and
     * there is nothing to store a file against.
     */
    private OutputSpec outputSpecFor(SaveProcessingFolderRequest request, Folder folder) {
        Map<String, Object> options =
                new HashMap<>(request.output() == null ? Map.of() : request.output());
        if (folder != null) {
            options.putIfAbsent("folderId", folder.getId().toString());
            return new OutputSpec("storage", options);
        }
        options.put("directory", request.directory().trim());
        options.put("replace", true);
        return new OutputSpec("folder", options);
    }

    private ProcessingFolderView toView(Policy policy) {
        return toView(policy, 0, 0, 0, 0);
    }

    /**
     * What the folder watches comes from its source, never from its output. Reading it off the
     * output made a disk-backed folder advertise the subdirectory its results go into as its own
     * address, and a client that groups by folderId pick up the output folder instead of the
     * watched one.
     */
    private ProcessingFolderView toView(
            Policy policy, int startedRuns, int alreadyProcessed, int parked, int retried) {
        Map<String, Object> output = new HashMap<>(policy.output().options());
        output.remove(SURFACE_OPTION);
        String sourceId = soleSourceId(policy);
        Source source = sourceId == null ? null : sourceStore.get(sourceId).orElse(null);
        Object folderId = source == null ? null : source.options().get("folderId");
        Object directory = source == null ? null : source.options().get("directory");
        return new ProcessingFolderView(
                policy.id(),
                folderId == null ? null : folderId.toString(),
                directory == null ? null : directory.toString(),
                policy.name(),
                policy.enabled(),
                policy.steps(),
                output,
                startedRuns,
                alreadyProcessed,
                parked,
                retried);
    }
}
