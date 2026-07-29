package stirling.software.proprietary.policy.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

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

import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.PolicyValidator;
import stirling.software.proprietary.policy.engine.SweepOutcome;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
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

    private final PolicyStore policyStore;
    private final SourceStore sourceStore;
    private final PolicyValidator policyValidator;
    private final PolicyRunner policyRunner;
    private final PolicyTriggerManager policyTriggerManager;
    private final ProcessedLedger processedLedger;
    private final FolderRepository folderRepository;
    private final FileStorageService fileStorageService;
    private final PolicyAccessGuard policyAccessGuard;

    /** What a processing folder looks like to the editor client. */
    public record ProcessingFolderView(
            String id,
            String folderId,
            String name,
            boolean enabled,
            List<PipelineStep> steps,
            Map<String, Object> output) {}

    /** Create/update payload. A null id creates; a present id updates the caller's own record. */
    public record SaveProcessingFolderRequest(
            String id,
            String folderId,
            Boolean enabled,
            List<PipelineStep> steps,
            Map<String, Object> output) {}

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
        Folder folder = requireOwnedFolder(request.folderId(), user);
        boolean isCreate = request.id() == null || request.id().isBlank();
        Policy existing = isCreate ? null : requireOwn(request.id(), user);

        Source source =
                sourceStore.save(
                        new Source(
                                existing == null ? null : soleSourceId(existing),
                                folder.getName(),
                                SOURCE_TYPE,
                                Map.of("folderId", folder.getId().toString()),
                                request.enabled() == null || request.enabled(),
                                policyAccessGuard.ownerForNewPolicy(),
                                policyAccessGuard.teamForNewPolicy()));
        Policy policy =
                new Policy(
                        existing == null ? null : existing.id(),
                        "Processing folder: " + folder.getName(),
                        policyAccessGuard.ownerForNewPolicy(),
                        request.enabled() == null || request.enabled(),
                        null,
                        List.of(source.id()),
                        request.steps() == null ? List.of() : request.steps(),
                        new OutputSpec("storage", outputOptions(request, folder)),
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
        if (isCreate) {
            // Process the backlog: everything already in the folder runs once, now.
            SweepOutcome outcome = policyRunner.run(saved);
            log.debug(
                    "Processing folder {} created; backlog sweep started {} runs",
                    saved.id(),
                    outcome.runIds().size());
        }
        return ResponseEntity.ok(toView(saved));
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

    private static Map<String, Object> outputOptions(
            SaveProcessingFolderRequest request, Folder folder) {
        Map<String, Object> options =
                new HashMap<>(request.output() == null ? Map.of() : request.output());
        options.put(SURFACE_OPTION, SURFACE);
        options.putIfAbsent("folderId", folder.getId().toString());
        return options;
    }

    private static ProcessingFolderView toView(Policy policy) {
        Map<String, Object> output = new HashMap<>(policy.output().options());
        output.remove(SURFACE_OPTION);
        return new ProcessingFolderView(
                policy.id(),
                String.valueOf(policy.output().options().get("folderId")),
                policy.name(),
                policy.enabled(),
                policy.steps(),
                output);
    }
}
