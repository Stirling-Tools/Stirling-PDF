package stirling.software.proprietary.workflow.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.workflow.model.WorkflowSession;

/** Serializes the complete signing finalization lifecycle for a workflow session. */
@Service
@RequiredArgsConstructor
public class WorkflowFinalizationCoordinator {

    private final WorkflowSessionService workflowSessionService;
    private final SigningFinalizationService signingFinalizationService;

    @Transactional(rollbackFor = Exception.class)
    public FinalizedWorkflow finalizeSession(String sessionId, User owner) throws Exception {
        WorkflowSession session =
                workflowSessionService.getSessionWithParticipantsForOwnerForUpdate(
                        sessionId, owner);
        if (!session.isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Workflow session is no longer active");
        }

        byte[] originalPdf = workflowSessionService.getOriginalFile(sessionId);
        byte[] finalizedPdf = signingFinalizationService.finalizeDocument(session, originalPdf);
        String filename = session.getDocumentName().replace(".pdf", "") + "_shared_signed.pdf";

        workflowSessionService.storeProcessedFile(session, finalizedPdf, filename);
        workflowSessionService.finalizeSession(sessionId, owner);
        signingFinalizationService.clearSensitiveMetadata(session);
        // Deleting the source is an external storage side effect. Defer it until the DB
        // transaction has committed so a commit failure cannot leave the workflow pointing at a
        // deleted original document.
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            workflowSessionService.deleteOriginalFile(session);
                        }
                    });
        } else {
            // Direct unit-test/in-process calls without a transaction retain the original cleanup
            // behavior; Spring-managed requests always take the after-commit branch above.
            workflowSessionService.deleteOriginalFile(session);
        }

        return new FinalizedWorkflow(finalizedPdf, filename);
    }

    public record FinalizedWorkflow(byte[] pdf, String filename) {}
}
