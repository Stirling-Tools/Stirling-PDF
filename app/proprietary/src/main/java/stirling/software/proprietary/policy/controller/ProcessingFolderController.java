package stirling.software.proprietary.policy.controller;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
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

import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.PolicyValidator;
import stirling.software.proprietary.policy.engine.SweepOutcome;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.policy.trigger.PolicyTriggerManager;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.Folder;
import stirling.software.proprietary.storage.repository.FolderRepository;
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

    /** Marker in the policy's output options separating this surface from policies/pipelines. */
    public static final String SURFACE_OPTION = "surface";

    public static final String SURFACE = "processing-folder";

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
    private final FileStorageService fileStorageService;
    private final PolicyAccessGuard policyAccessGuard;
    private final FolderAccessGuard folderAccessGuard;

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
            int alreadyProcessed) {}

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
        fileStorageService.requireAuthenticatedUser();
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
        User user = fileStorageService.requireAuthenticatedUser();
        return policyAccessGuard.visibleFrom(policyStore).stream()
                .filter(ProcessingFolderController::isProcessingFolder)
                .filter(policy -> ownedBy(policy, user))
                .map(ProcessingFolderController::toView)
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
        User user = fileStorageService.requireAuthenticatedUser();
        boolean onDisk = request.directory() != null && !request.directory().isBlank();
        if (onDisk == (request.folderId() != null && !request.folderId().isBlank())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "a processing folder needs either a folderId or a directory, not both");
        }
        Folder folder = onDisk ? null : requireOwnedFolder(request.folderId(), user);
        boolean isCreate = request.id() == null || request.id().isBlank();
        Policy existing = isCreate ? null : requireOwn(request.id(), user);
        String name = onDisk ? diskFolderName(request.directory()) : folder.getName();
        Folder diskOutputFolder =
                onDisk ? diskOutputFolderFor(existing, request.directory(), user) : null;

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
                        // A disk directory is watched, so the folder reacts to arrivals on its own.
                        // A null trigger would make it manual-only: the create-time backlog sweep
                        // would run and nothing would ever process again. Storage-backed folders
                        // stay manual until the storage arrival trigger exists — folder-watch only
                        // supports directory sources.
                        onDisk ? new TriggerConfig(WATCH_TRIGGER, Map.of()) : null,
                        List.of(source.id()),
                        request.steps() == null ? List.of() : request.steps(),
                        outputSpecFor(request, folder, diskOutputFolder),
                        policyAccessGuard.teamForNewPolicy());
        try {
            policyValidator.validate(policy);
        } catch (IllegalArgumentException e) {
            if (existing == null) {
                sourceStore.delete(source.id());
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        Policy saved = policyStore.save(policy);
        policyTriggerManager.notifyPoliciesChanged();
        if (!isCreate) {
            return ResponseEntity.ok(toView(saved));
        }
        // Process the backlog: everything already in the folder runs once, now. The counts go back
        // to the caller so a client can report real progress — and can tell "nothing new to do"
        // apart from "work started", instead of waiting for runs that were never going to appear.
        SweepOutcome outcome = policyRunner.run(saved);
        log.debug(
                "Processing folder {} created; backlog sweep started {} runs ({} already processed,"
                        + " {} listed)",
                saved.id(),
                outcome.runIds().size(),
                outcome.alreadyProcessed(),
                outcome.filesListed());
        return ResponseEntity.ok(
                toView(saved, outcome.runIds().size(), outcome.alreadyProcessed()));
    }

    /** One file in a mounted directory, as the file manager needs to list it. */
    public record MountedFileView(String name, long sizeBytes, long lastModified) {}

    @GetMapping("/{id}/files")
    @Operation(
            summary = "List the files in a disk-backed processing folder",
            description =
                    "The directory itself is the source of truth — nothing is mirrored into app"
                            + " storage — so the file manager reads its contents through here."
                            + " Empty for a storage-backed folder, whose files are ordinary stored"
                            + " files.")
    public List<MountedFileView> files(@PathVariable String id) {
        User user = fileStorageService.requireAuthenticatedUser();
        Policy policy = requireOwn(id, user);
        Path directory = watchedDirectory(policy);
        if (directory == null) {
            return List.of();
        }
        // Re-check on read: the permitted roots may have narrowed since the folder was created.
        Path permitted = folderAccessGuard.requirePermitted(directory);
        try (Stream<Path> entries = Files.list(permitted)) {
            return entries.filter(Files::isRegularFile)
                    .filter(path -> !path.getFileName().toString().startsWith("."))
                    .map(ProcessingFolderController::toMountedFile)
                    .filter(Objects::nonNull)
                    .toList();
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Could not read " + permitted + ": " + e.getMessage());
        }
    }

    private static MountedFileView toMountedFile(Path path) {
        try {
            return new MountedFileView(
                    path.getFileName().toString(),
                    Files.size(path),
                    Files.getLastModifiedTime(path).toMillis());
        } catch (IOException vanished) {
            return null; // listed then removed; the next read tells the truth
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
        User user = fileStorageService.requireAuthenticatedUser();
        Policy policy = requireOwn(id, user);
        return ResponseEntity.accepted().body(policyRunner.run(policy));
    }

    @DeleteMapping("/{id}")
    @Operation(
            summary = "Delete a processing folder",
            description =
                    "Removes the pipeline and its source. The storage folder and every file in it"
                            + " are untouched.")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        User user = fileStorageService.requireAuthenticatedUser();
        Policy policy = requireOwn(id, user);
        policyStore.delete(policy.id());
        policy.sourceIds().forEach(sourceStore::delete);
        processedLedger.clearPolicy(policy.id());
        policyTriggerManager.notifyPoliciesChanged();
        return ResponseEntity.noContent().build();
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
        return policy.owner() == null || Objects.equals(policy.owner(), user.getUsername());
    }

    /** The pair's source id; the compose invariant is exactly one source per processing folder. */
    private static String soleSourceId(Policy policy) {
        return policy.sourceIds().isEmpty() ? null : policy.sourceIds().get(0);
    }

    /** Whether a policy record belongs to this surface (and so is hidden from the others). */
    public static boolean isProcessingFolder(Policy policy) {
        return policy.output() != null
                && SURFACE.equals(policy.output().options().get(SURFACE_OPTION));
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
                "identity",
                "hash",
                "recursive",
                false,
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
     * Where results go. Both kinds write into app storage, so a run's output is a first-class
     * Stirling file the user can open and run tools on.
     *
     * <p>A storage-backed folder writes back into itself. A disk-backed one writes into a storage
     * folder created to receive its results — the watched directory holds the user's own files and
     * is never written to, and storage is the only place an output is kept, so there is no second
     * copy to diverge from. Outputs are recorded in the ledger before they become visible, so the
     * producing policy can never claim its own output as new work.
     *
     * <p>TEMPORARY: results being separated from the directory they came from is a stopgap until
     * files carry a link to their location on disk. Once that lands, the results belong in the
     * mounted view alongside their originals, and this branch collapses back into the one above.
     */
    private OutputSpec outputSpecFor(
            SaveProcessingFolderRequest request, Folder folder, Folder diskOutputFolder) {
        Map<String, Object> options =
                new HashMap<>(request.output() == null ? Map.of() : request.output());
        options.put(SURFACE_OPTION, SURFACE);
        if (folder != null) {
            options.putIfAbsent("folderId", folder.getId().toString());
            return new OutputSpec("storage", options);
        }
        options.put("folderId", diskOutputFolder.getId().toString());
        // Nothing to version: the input is a file on disk with no stored row behind it, so each
        // result has to land as a new file rather than replacing something.
        options.put("mode", "new_file");
        return new OutputSpec("storage", options);
    }

    /**
     * The storage folder a disk-backed processing folder delivers its results into, created on
     * first save and reused afterwards. Named after the directory being watched, since that is what
     * the user is looking for when they go hunting for the results.
     */
    private Folder diskOutputFolderFor(Policy existing, String directory, User user) {
        UUID reused = storageFolderIdOf(existing);
        if (reused != null) {
            Optional<Folder> found = folderRepository.findById(reused);
            if (found.isPresent()) {
                return found.get();
            }
        }
        Folder created = new Folder();
        created.setId(UUID.randomUUID());
        created.setOwner(user);
        created.setName(diskFolderName(directory));
        return folderRepository.saveAndFlush(created);
    }

    /** The storage folder a policy already delivers into, or null if it has none. */
    private static UUID storageFolderIdOf(Policy policy) {
        if (policy == null || policy.output() == null) {
            return null;
        }
        Object raw = policy.output().options().get("folderId");
        if (raw == null || String.valueOf(raw).isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(String.valueOf(raw));
        } catch (IllegalArgumentException notAnId) {
            return null;
        }
    }

    private static ProcessingFolderView toView(Policy policy) {
        return toView(policy, 0, 0);
    }

    private static ProcessingFolderView toView(
            Policy policy, int startedRuns, int alreadyProcessed) {
        Map<String, Object> output = new HashMap<>(policy.output().options());
        output.remove(SURFACE_OPTION);
        Object folderId = policy.output().options().get("folderId");
        Object directory = policy.output().options().get("directory");
        return new ProcessingFolderView(
                policy.id(),
                folderId == null ? null : folderId.toString(),
                directory == null ? null : directory.toString(),
                policy.name(),
                policy.enabled(),
                policy.steps(),
                output,
                startedRuns,
                alreadyProcessed);
    }
}
