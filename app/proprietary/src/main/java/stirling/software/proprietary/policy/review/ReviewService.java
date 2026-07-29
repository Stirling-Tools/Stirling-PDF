package stirling.software.proprietary.policy.review;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.FileStore;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.TaskManager;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.engine.PolicyEngine;
import stirling.software.proprietary.policy.engine.PolicyRunRegistry;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunStatus;
import stirling.software.proprietary.policy.model.RunOrigin;
import stirling.software.proprietary.policy.output.OutputDelivery;
import stirling.software.proprietary.policy.output.PolicyOutputSink;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.review.store.ReviewStore;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Resolves review items: approve delivers the held files to the run's original destination (from
 * the item's persisted {@link OutputSpec}, so it works after a restart); reject discards them. Team
 * scoping mirrors the policy endpoints — an item outside the caller's team reads as 404.
 *
 * <p>Held files are read via the low-level {@link FileStore} rather than {@code FileStorage}: they
 * were stored owned by the run's file owner, and the reviewer is a different user by design. The
 * team check on the item is the authorization for that access.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReviewService {

    private final ReviewStore reviewStore;
    private final PolicyStore policyStore;
    private final PolicyEngine policyEngine;
    private final FileStore fileStore;
    private final List<PolicyOutputSink> outputSinks;
    private final PolicyRunRegistry runRegistry;
    private final TaskManager taskManager;
    private final PolicyManagementAuthority policyManagementAuthority;
    private final ApplicationProperties applicationProperties;
    private final Optional<UserServiceInterface> userService;

    public ReviewBucketConfig config() {
        return reviewStore.configForTeam(currentTeamId());
    }

    public ReviewBucketConfig saveConfig(ReviewBucketConfig config) {
        return reviewStore.saveConfig(currentTeamId(), config);
    }

    public List<ReviewItem> items(ReviewItemStatus status) {
        return reviewStore.itemsForTeam(currentTeamId(), status);
    }

    /**
     * Release the held files to the run's original destination and resolve the item.
     *
     * <p>A failed run is the exception: its files are the unprocessed INPUTS, so delivering them
     * directly would push a document that never passed the policy to the destination. Approving a
     * failure instead IGNORES the error and re-runs the whole pipeline on the kept input — the
     * document reaches the destination only by passing through the policy, and the kept copy is
     * removed. A retry that fails again simply lands back in the queue as a fresh item.
     */
    public ReviewItem approve(String itemId) throws IOException {
        ReviewItem item = requirePendingTeamItem(itemId);
        claimOrConflict(item, ReviewItemStatus.APPROVED);
        try {
            return deliverApproved(item);
        } catch (IOException | RuntimeException e) {
            // Delivery didn't complete: put the item back so the reviewer can retry.
            reviewStore.releaseClaim(item.id());
            throw e;
        }
    }

    private ReviewItem deliverApproved(ReviewItem item) throws IOException {
        if (item.filesAreInputs()) {
            Policy policy =
                    policyStore
                            .get(item.policyId())
                            .orElseThrow(
                                    () ->
                                            new ResponseStatusException(
                                                    HttpStatus.CONFLICT,
                                                    "The policy for this item no longer exists, so"
                                                            + " the file cannot be re-run"));
            // Bytes are read into memory here, so deleting the held copies below is safe
            // even though the re-run is asynchronous.
            List<Resource> inputs =
                    item.files().stream().map(this::toResource).map(Resource.class::cast).toList();
            if (!inputs.isEmpty()) {
                policyEngine.runPolicy(
                        policy,
                        PolicyInputs.of(inputs),
                        PolicyProgressListener.NOOP,
                        RunOrigin.SOURCE);
            }
            deleteHeldFiles(item);
            ReviewItem resolved = item.resolved(ReviewItemStatus.APPROVED, currentUsername());
            reviewStore.saveItem(resolved);
            log.info(
                    "Review item {} approved: failure ignored, {} input file(s) re-run through"
                            + " policy {}",
                    item.id(),
                    inputs.size(),
                    policy.id());
            return resolved;
        }
        if (!item.files().isEmpty()) {
            List<Resource> resources =
                    item.files().stream().map(this::toResource).map(Resource.class::cast).toList();
            OutputSpec output = item.output() == null ? OutputSpec.inline() : item.output();
            List<ResultFile> delivered =
                    sinkFor(output)
                            .deliver(
                                    new OutputDelivery(item.runId(), item.policyId()),
                                    resources,
                                    output);
            deleteHeldFiles(item);
            completeLiveRun(item, delivered);
        }
        ReviewItem resolved = item.resolved(ReviewItemStatus.APPROVED, currentUsername());
        reviewStore.saveItem(resolved);
        log.info("Review item {} approved; run {} released", item.id(), item.runId());
        return resolved;
    }

    /** One item a bulk decision could not resolve, and why. */
    public record BulkFailure(String itemId, String reason) {}

    /** Outcome of a bulk decision: how many resolved, and what did not. */
    public record BulkResult(int succeeded, List<BulkFailure> failures) {}

    /**
     * Apply the same decision to several items, one at a time.
     *
     * <p>Best effort by design: a bulk decision covers a queue the reviewer has already looked at,
     * and one bad item (already resolved elsewhere, deleted policy, missing bytes) must not strand
     * the rest. Each failure is reported back so the portal can say what was left behind.
     */
    public BulkResult resolveAll(List<String> itemIds, ReviewItemStatus decision) {
        if (decision != ReviewItemStatus.APPROVED && decision != ReviewItemStatus.REJECTED) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Bulk decision must be APPROVED or REJECTED");
        }
        if (itemIds == null || itemIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No items given");
        }
        int succeeded = 0;
        List<BulkFailure> failures = new ArrayList<>();
        for (String itemId : itemIds) {
            if (itemId == null || itemId.isBlank()) {
                continue;
            }
            try {
                if (decision == ReviewItemStatus.APPROVED) {
                    approve(itemId);
                } else {
                    reject(itemId);
                }
                succeeded++;
            } catch (IOException | RuntimeException e) {
                String reason =
                        e instanceof ResponseStatusException statusException
                                ? statusException.getReason()
                                : e.getMessage();
                failures.add(new BulkFailure(itemId, reason));
                log.warn("Bulk {} skipped item {}: {}", decision, itemId, reason);
            }
        }
        log.info("Bulk {}: {} resolved, {} failed", decision, succeeded, failures.size());
        return new BulkResult(succeeded, failures);
    }

    /** Discard the held files and resolve the item. */
    public ReviewItem reject(String itemId) {
        ReviewItem item = requirePendingTeamItem(itemId);
        claimOrConflict(item, ReviewItemStatus.REJECTED);
        try {
            deleteHeldFiles(item);
            cancelLiveRun(item);
            ReviewItem resolved = item.resolved(ReviewItemStatus.REJECTED, currentUsername());
            reviewStore.saveItem(resolved);
            log.info("Review item {} rejected; held files discarded", item.id());
            return resolved;
        } catch (RuntimeException e) {
            reviewStore.releaseClaim(item.id());
            throw e;
        }
    }

    /**
     * The PENDING check in {@link #requirePendingTeamItem} is only a fast pre-read; this claim is
     * what actually serializes concurrent resolutions (double-click, second tab, a single approve
     * racing a bulk one). Losing the claim means the other caller delivers or discards the files —
     * doing it here too would deliver them twice.
     */
    private void claimOrConflict(ReviewItem item, ReviewItemStatus decision) {
        if (!reviewStore.claimPending(item.id(), decision)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Review item is already resolved");
        }
    }

    /** A held file's content, for the reviewer to inspect before deciding. */
    public HeldFileContent heldFile(String itemId, String fileId) {
        ReviewItem item = requireTeamItem(itemId);
        HeldFile file =
                item.files().stream()
                        .filter(held -> held.fileId().equals(fileId))
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "No such held file"));
        try {
            return new HeldFileContent(file.fileName(), fileStore.retrieveBytes(fileId));
        } catch (IOException e) {
            // Resolving an item deletes its held bytes, so a stale link lands here.
            throw new ResponseStatusException(
                    HttpStatus.GONE, "Held file is no longer available", e);
        }
    }

    public record HeldFileContent(String fileName, byte[] bytes) {}

    private ReviewItem requirePendingTeamItem(String itemId) {
        ReviewItem item = requireTeamItem(itemId);
        if (item.status() != ReviewItemStatus.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Review item is already resolved");
        }
        return item;
    }

    private ReviewItem requireTeamItem(String itemId) {
        ReviewItem item =
                reviewStore
                        .getItem(itemId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "No review item: " + itemId));
        // Cross-team ids read as 404, mirroring PolicyAccessGuard. Unenforced when login is off.
        if (applicationProperties.getSecurity().isEnableLogin()
                && !Objects.equals(item.teamId(), currentTeamId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No review item: " + itemId);
        }
        return item;
    }

    private Long currentTeamId() {
        return applicationProperties.getSecurity().isEnableLogin()
                ? policyManagementAuthority.currentUserTeamId()
                : null;
    }

    private String currentUsername() {
        return userService.map(UserServiceInterface::getCurrentUsername).orElse(null);
    }

    private ByteArrayResource toResource(HeldFile file) {
        try {
            byte[] bytes = fileStore.retrieveBytes(file.fileId());
            return new ByteArrayResource(bytes) {
                @Override
                public String getFilename() {
                    return file.fileName();
                }
            };
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Held file " + file.fileName() + " is no longer available",
                    e);
        }
    }

    private void deleteHeldFiles(ReviewItem item) {
        for (HeldFile file : item.files()) {
            try {
                fileStore.delete(file.fileId());
            } catch (RuntimeException e) {
                log.warn("Could not delete held file {}: {}", file.fileId(), e.getMessage());
            }
        }
    }

    // The in-memory run only exists until a restart; the item is the durable record, so both
    // run updates are best-effort cosmetics for anyone watching the run endpoints.
    private void completeLiveRun(ReviewItem item, List<ResultFile> delivered) {
        try {
            PolicyRun run = runRegistry.get(item.runId());
            if (run != null && run.getStatus() == PolicyRunStatus.WAITING_FOR_INPUT) {
                run.complete(delivered);
                taskManager.setMultipleFileResults(item.runId(), delivered);
                taskManager.setComplete(item.runId());
            }
        } catch (RuntimeException e) {
            log.warn("Could not update live run {}: {}", item.runId(), e.getMessage());
        }
    }

    private void cancelLiveRun(ReviewItem item) {
        try {
            PolicyRun run = runRegistry.get(item.runId());
            if (run != null && run.getStatus() == PolicyRunStatus.WAITING_FOR_INPUT) {
                run.cancel();
                taskManager.addNote(item.runId(), "Rejected in review");
            }
        } catch (RuntimeException e) {
            log.warn("Could not update live run {}: {}", item.runId(), e.getMessage());
        }
    }

    private PolicyOutputSink sinkFor(OutputSpec spec) {
        return outputSinks.stream()
                .filter(sink -> sink.supports(spec))
                .findFirst()
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "No output sink supports spec: " + spec.type()));
    }
}
