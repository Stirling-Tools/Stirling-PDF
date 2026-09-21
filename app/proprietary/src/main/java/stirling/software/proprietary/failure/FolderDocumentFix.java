package stirling.software.proprietary.failure;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.InternalApiClient;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.input.FolderDocuments;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.output.FolderOutputSink;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Runs a fixing tool over a smart folder's document in place, then re-runs the policy.
 * Authorisation is re-derived here: the guard checks the owner, {@link FolderDocuments} the path.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FolderDocumentFix {

    private final PolicyStore policyStore;
    private final PolicyFailureRecorder failureRecorder;
    private final PolicyAccessGuard policyAccessGuard;
    private final FolderDocuments folderDocuments;
    private final InternalApiClient internalApi;
    private final FolderOutputSink folderOutputSink;
    private final ProcessedLedger processedLedger;
    private final PolicyRunner policyRunner;
    private final FileRunEventStore store;

    /**
     * Fix this row's document with {@code endpoint} and {@code parameters}, then re-run. {@code
     * refusalMessage} replaces the tool's own words, which can name a temp path.
     */
    public FileRunEvent fixAndRerun(
            FileRunEvent event,
            String actor,
            String endpoint,
            Map<String, String> parameters,
            String refusalMessage) {
        Policy policy = ownedFolderFor(event);
        String identity = documentIdentity(event);
        Path document =
                folderDocuments.locate(policy, identity).orElseThrow(() -> notTheirs(event));

        Resource fixed = runTool(event, actor, endpoint, document, parameters, refusalMessage);
        try {
            folderOutputSink.replaceInPlace(document, fixed);
        } catch (IOException e) {
            log.warn(
                    "Could not write a fixed document back into policy {}: {}",
                    policy.id(),
                    e.getMessage());
            throw new FailureActionException(
                    FailureActionException.Reason.FIX_FAILED,
                    "The fixed document could not be written back to the folder");
        }

        // Answer ignored, unlike a plain retry: the rewrite is a new version the sweep claims
        // anyway, and refusing after the fix is spent would leave the document unprocessed.
        processedLedger.forgetFailure(policy.id(), identity);
        policyRunner.runFile(policy, identity);

        // Closed on dispatch, not on the re-run's outcome: the run is asynchronous, and a repeat
        // failure records its own incident, which folds back onto this row by dedup key.
        return store.applyStatus(event.id(), event.teamId(), FileRunEventStatus.RESOLVED, actor);
    }

    /**
     * The folder this row came from, if the caller owns it. Every refusal is the same {@code
     * EVENT_NOT_FOUND}, so a caller cannot tell a folder that is not theirs from one that is gone.
     */
    public Policy ownedFolderFor(FileRunEvent event) {
        if (event.policyId() == null || event.policyId().isBlank()) {
            throw notTheirs(event);
        }
        return policyStore
                .get(event.policyId())
                .filter(policy -> Policy.SURFACE_PROCESSING_FOLDER.equals(policy.surface()))
                .filter(policyAccessGuard::canAccess)
                .orElseThrow(() -> notTheirs(event));
    }

    /**
     * The one document this row is about. Taken from the row, never from the caller, so no input
     * can widen a press to a sibling file or to another folder.
     */
    public String documentIdentity(FileRunEvent event) {
        String identity = event.fileId();
        if (identity == null || identity.isBlank()) {
            throw new FailureActionException(
                    FailureActionException.Reason.ACTION_NOT_DECLARED,
                    "This failure names no document to work on");
        }
        return identity;
    }

    public FailureActionException notTheirs(FileRunEvent event) {
        log.debug("Refused a folder action on event {} (policy {})", event.id(), event.policyId());
        return new FailureActionException(
                FailureActionException.Reason.EVENT_NOT_FOUND,
                "No smart folder holds this document");
    }

    /**
     * Loopback rather than a direct service call, the way every other automation runs a tool: the
     * step is then billed, audited and rate-limited as the caller's own automation work.
     */
    private Resource runTool(
            FileRunEvent event,
            String actor,
            String endpoint,
            Path document,
            Map<String, String> parameters,
            String refusalMessage) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("fileInput", new FileSystemResource(document));
        parameters.forEach(body::add);

        ResponseEntity<Resource> response;
        try {
            response = internalApi.post(endpoint, body);
        } catch (RestClientResponseException refused) {
            supersedeIfTheToolKnowsBetter(event, actor, refused);
            throw new FailureActionException(
                    FailureActionException.Reason.FIX_FAILED, refusalMessage);
        } catch (RestClientException unreachable) {
            // No response to read a verdict out of: the tool never answered, which says nothing
            // about the document, so the row keeps its kind and its offer.
            log.debug("Tool {} could not be reached: {}", endpoint, unreachable.getMessage());
            throw new FailureActionException(
                    FailureActionException.Reason.FIX_FAILED, refusalMessage);
        }
        Resource fixed = response.getBody();
        if (fixed == null) {
            throw new FailureActionException(
                    FailureActionException.Reason.FIX_FAILED, refusalMessage);
        }
        return fixed;
    }

    /**
     * Replace the row when the refusal says what its kind does not, so a refused fix is not
     * re-offered. A code the kind already claims (a wrong password) is left, to be retried.
     */
    private void supersedeIfTheToolKnowsBetter(
            FileRunEvent event, String actor, RestClientResponseException refused) {
        String code = DownstreamProblemDetail.errorCodeOf(refused);
        FailureKind verdict = FailureKind.byErrorCode(code).orElse(null);
        if (verdict == null || verdict == event.kind()) {
            return;
        }
        // Recorded before the old row closes, so the document is never momentarily unaccounted for.
        failureRecorder.recordDocumentFailureAs(
                verdict, event, DownstreamProblemDetail.detailOf(refused));
        store.applyStatus(event.id(), event.teamId(), FileRunEventStatus.RESOLVED, actor);
        log.debug("Row {} superseded by {} after its fix was refused", event.id(), verdict.getId());
    }
}
