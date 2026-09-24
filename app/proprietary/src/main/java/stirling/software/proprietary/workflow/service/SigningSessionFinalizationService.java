package stirling.software.proprietary.workflow.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowSession;

/**
 * Publishes the signed document and clears credentials atomically while holding the session lock.
 */
@Service
@RequiredArgsConstructor
public class SigningSessionFinalizationService {
    private final WorkflowSessionService workflowSessionService;
    private final SigningFinalizationService signingFinalizationService;

    /** Requires at least one accepted signature; any failure leaves the session open for retry. */
    @Transactional(rollbackFor = Exception.class)
    public FinalizedDocument finalizeSession(String sessionId, User owner) throws Exception {
        WorkflowSession session =
                workflowSessionService.lockActiveSessionForOwner(sessionId, owner);
        boolean hasSignature = false;
        for (var participant : session.getParticipants()) {
            if (participant.getStatus() == ParticipantStatus.SIGNED) {
                hasSignature = true;
                var metadata = participant.getParticipantMetadata();
                if (metadata != null
                        && metadata.get("certificateSubmission")
                                instanceof java.util.Map<?, ?> submission) {
                    workflowSessionService.ensureCertificateTypeAllowed(
                            (String) submission.get("certType"));
                }
            }
        }
        if (!hasSignature) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "At least one participant must sign before finalization");
        }
        byte[] original = workflowSessionService.getOriginalFile(sessionId);
        byte[] pdf = signingFinalizationService.finalizeDocument(session, original);
        String filename =
                session.getDocumentName().replaceFirst("(?i)\\.pdf$", "") + "_shared_signed.pdf";
        workflowSessionService.storeProcessedFile(session, pdf, filename);
        signingFinalizationService.clearSensitiveMetadata(session);
        workflowSessionService.finalizeSession(sessionId, owner);
        return new FinalizedDocument(pdf, filename);
    }

    /** The response is returned only after the finalization transaction commits. */
    public record FinalizedDocument(byte[] bytes, String filename) {}
}
