package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowStatus;
import stirling.software.proprietary.workflow.service.WorkflowFinalizationCoordinator.FinalizedWorkflow;

@ExtendWith(MockitoExtension.class)
class WorkflowFinalizationCoordinatorTest {

    @Mock private WorkflowSessionService workflowSessionService;
    @Mock private SigningFinalizationService signingFinalizationService;

    @Test
    void inactiveSession_isRejectedBeforePdfProcessing() throws Exception {
        User owner = owner();
        WorkflowSession session = session();
        session.setStatus(WorkflowStatus.COMPLETED);
        when(workflowSessionService.getSessionWithParticipantsForOwnerForUpdate("s1", owner))
                .thenReturn(session);
        WorkflowFinalizationCoordinator coordinator = coordinator();

        assertThatThrownBy(() -> coordinator.finalizeSession("s1", owner))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        verify(signingFinalizationService, never())
                .finalizeDocument(
                        org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        verify(workflowSessionService, never())
                .storeProcessedFile(
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any());
    }

    @Test
    void activeSession_isLockedBeforeProcessingAndCompletedInOrder() throws Exception {
        User owner = owner();
        WorkflowSession session = session();
        byte[] original = new byte[] {1};
        byte[] finalized = new byte[] {2};
        when(workflowSessionService.getSessionWithParticipantsForOwnerForUpdate("s1", owner))
                .thenReturn(session);
        when(workflowSessionService.getOriginalFile("s1")).thenReturn(original);
        when(signingFinalizationService.finalizeDocument(session, original)).thenReturn(finalized);
        WorkflowFinalizationCoordinator coordinator = coordinator();

        FinalizedWorkflow result = coordinator.finalizeSession("s1", owner);

        assertThat(result.pdf()).isSameAs(finalized);
        assertThat(result.filename()).isEqualTo("document_shared_signed.pdf");
        InOrder order = inOrder(workflowSessionService, signingFinalizationService);
        order.verify(workflowSessionService)
                .getSessionWithParticipantsForOwnerForUpdate("s1", owner);
        order.verify(workflowSessionService).getOriginalFile("s1");
        order.verify(signingFinalizationService).finalizeDocument(session, original);
        order.verify(workflowSessionService)
                .storeProcessedFile(session, finalized, "document_shared_signed.pdf");
        order.verify(workflowSessionService).finalizeSession("s1", owner);
        order.verify(signingFinalizationService).clearSensitiveMetadata(session);
        order.verify(workflowSessionService).deleteOriginalFile(session);
    }

    private WorkflowFinalizationCoordinator coordinator() {
        return new WorkflowFinalizationCoordinator(
                workflowSessionService, signingFinalizationService);
    }

    private User owner() {
        User owner = new User();
        owner.setId(1L);
        owner.setUsername("owner");
        return owner;
    }

    private WorkflowSession session() {
        WorkflowSession session = new WorkflowSession();
        session.setSessionId("s1");
        session.setDocumentName("document.pdf");
        session.setStatus(WorkflowStatus.IN_PROGRESS);
        return session;
    }
}
