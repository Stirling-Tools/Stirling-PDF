package stirling.software.proprietary.storage.egress;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.FileStore;
import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.engine.PolicyEngine;
import stirling.software.proprietary.policy.engine.PolicyRunHandle;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunStatus;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.repository.FileShareRepository;

/** Produces the processed copy a recipient receives; cached per share, and fails closed. */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShareEgressProcessor {

    /** Long enough for a rasterising watermark, short enough to surface a wedged run. */
    private static final long TRANSFORM_TIMEOUT_SECONDS = 120;

    /** Renders every page to an image, so a view-only copy carries no reusable text or objects. */
    private static final PipelineStep RASTERISE =
            new PipelineStep("/api/v1/misc/flatten", Map.of("flattenOnlyForms", false));

    private final PolicyStore policyStore;
    private final PolicyEngine policyEngine;

    /**
     * The low-level store, not {@code FileStorage}: the share has already authorised this
     * recipient, and the job-ownership gate would refuse every recipient but the one whose download
     * derived the cached copy.
     */
    private final FileStore fileStore;

    private final FileShareRepository fileShareRepository;

    /** The bytes to serve: cached copy, a fresh one, or the original when nothing processes it. */
    public Resource resolve(FileShare share, Resource original, ShareEgressDecision decision) {
        if (!decision.requiresManagedDelivery()) {
            return original;
        }
        String cached = cachedFileId(share, decision);
        if (cached != null) {
            try {
                return toResource(cached, original.getFilename());
            } catch (IOException | RuntimeException e) {
                log.warn(
                        "Cached processed copy {} could not be read; re-deriving: {}",
                        cached,
                        e.getMessage());
            }
        }
        String fileId = derive(share, original, decision);
        try {
            return toResource(fileId, original.getFilename());
        } catch (IOException e) {
            throw refuse(decision, e);
        }
    }

    /** The still-valid cached copy for this decision, or null if absent, stale, or swept away. */
    private String cachedFileId(FileShare share, ShareEgressDecision decision) {
        String fileId = share.getEgressFileId();
        if (fileId == null
                || !Objects.equals(decision.transformFingerprint(), share.getEgressFingerprint())) {
            return null;
        }
        return fileStore.exists(fileId) ? fileId : null;
    }

    /** Runs each policy's chain on the previous one's output; records the result on the share. */
    private String derive(FileShare share, Resource original, ShareEgressDecision decision) {
        Resource current = original;
        String fileId = null;
        for (String policyId : decision.transformPolicyIds()) {
            Policy policy = policyStore.get(policyId).orElse(null);
            if (policy == null || policy.steps().isEmpty()) {
                // Deleted between the decision and here; nothing to apply for this link in the
                // chain, so carry the current bytes forward.
                continue;
            }
            fileId = runChain(policy, current, decision);
            current = read(fileId, original.getFilename(), decision);
        }
        if (decision.viewOnly()) {
            // View-only means no working copy leaves, so the bytes are rasterised whatever
            // disposition the client asked for.
            fileId = runChain(rasterisingPolicy(decision), current, decision);
        }
        if (fileId == null) {
            throw new ShareEgressException(
                    new ShareEgressDecision(
                            false,
                            "The sharing policy that governs this document is no longer available",
                            null,
                            null,
                            false,
                            decision.external(),
                            decision.policyId(),
                            decision.policyName(),
                            List.of(),
                            null));
        }
        stampCache(share, decision, fileId);
        return fileId;
    }

    /** The rasterising pass, attributed and billed to the policy that asked for view-only. */
    private Policy rasterisingPolicy(ShareEgressDecision decision) {
        Policy deciding =
                decision.policyId() == null
                        ? null
                        : policyStore.get(decision.policyId()).orElse(null);
        return new Policy(
                decision.policyId(),
                deciding != null ? deciding.name() : decision.policyName(),
                deciding != null ? deciding.owner() : null,
                true,
                List.of(),
                List.of(RASTERISE),
                OutputSpec.inline(),
                deciding != null ? deciding.teamId() : null);
    }

    /** Attributed to the policy and billed to its owner, not to whoever downloads. */
    private String runChain(Policy policy, Resource input, ShareEgressDecision decision) {
        PolicyRunHandle handle =
                policyEngine.runPolicy(
                        policy, PolicyInputs.of(List.of(input)), PolicyProgressListener.NOOP);
        PolicyRun run;
        try {
            run = handle.completion().get(TRANSFORM_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw refuse(decision, e);
        } catch (ExecutionException | TimeoutException e) {
            policyEngine.cancel(handle.runId());
            throw refuse(decision, e);
        }
        if (run.getStatus() != PolicyRunStatus.COMPLETED || run.getOutputs().isEmpty()) {
            log.warn(
                    "Sharing policy {} could not process the outgoing copy (run {} ended {}): {}",
                    policy.id(),
                    handle.runId(),
                    run.getStatus(),
                    run.getError());
            throw refuse(decision, null);
        }
        ResultFile output = run.getOutputs().get(0);
        return output.getFileId();
    }

    /** Best-effort: a failed stamp costs a re-derive, so it must not fail the download. */
    private void stampCache(FileShare share, ShareEgressDecision decision, String fileId) {
        try {
            share.setEgressFileId(fileId);
            share.setEgressFingerprint(decision.transformFingerprint());
            fileShareRepository.save(share);
        } catch (RuntimeException e) {
            log.warn(
                    "Could not cache the processed copy for share {}: {}",
                    share.getId(),
                    e.getMessage());
        }
    }

    private Resource read(String fileId, String filename, ShareEgressDecision decision) {
        try {
            return toResource(fileId, filename);
        } catch (IOException e) {
            throw refuse(decision, e);
        }
    }

    private Resource toResource(String fileId, String filename) throws IOException {
        byte[] bytes = fileStore.retrieveBytes(fileId);
        return new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }

    private static ShareEgressException refuse(ShareEgressDecision decision, Throwable cause) {
        if (cause != null) {
            log.warn("Egress processing failed for policy {}", decision.policyId(), cause);
        }
        return new ShareEgressException(
                new ShareEgressDecision(
                        false,
                        "This document could not be prepared for sharing, so it was not released",
                        null,
                        null,
                        false,
                        decision.external(),
                        decision.policyId(),
                        decision.policyName(),
                        List.of(),
                        null));
    }
}
