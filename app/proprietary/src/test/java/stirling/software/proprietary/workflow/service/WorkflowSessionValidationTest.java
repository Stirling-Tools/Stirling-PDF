package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Optional;

import org.apache.pdfbox.Loader;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.workflow.dto.ParticipantRequest;
import stirling.software.proprietary.workflow.dto.WorkflowCreationRequest;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowType;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.repository.WorkflowSessionRepository;

@ExtendWith(MockitoExtension.class)
class WorkflowSessionValidationTest {
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private StorageProvider storageProvider;
    @Mock private WorkflowSessionRepository workflowSessionRepository;
    @Mock private WorkflowParticipantRepository workflowParticipantRepository;
    @Mock private UserRepository userRepository;
    @InjectMocks private WorkflowSessionService service;

    @Test
    void rejectsEmptyParticipantsBeforeStoringAnything() {
        var request = new WorkflowCreationRequest();
        request.setWorkflowType(WorkflowType.SIGNING);
        assertThatThrownBy(() -> service.createSession(new User(), invalidPdf(), request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("At least one participant");
        verifyNoInteractions(storageProvider, workflowSessionRepository, pdfDocumentFactory);
    }

    @Test
    void rejectsNonPdfBytesBeforeStorage() throws Exception {
        var request = new WorkflowCreationRequest();
        request.setWorkflowType(WorkflowType.SIGNING);
        request.setParticipantEmails(List.of("alice@example.test"));
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true)))
                .thenAnswer(
                        invocation ->
                                Loader.loadPDF(
                                        ((MultipartFile) invocation.getArgument(0)).getBytes()));
        assertThatThrownBy(() -> service.createSession(new User(), invalidPdf(), request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("readable, unprotected PDF");
        verifyNoInteractions(storageProvider, workflowSessionRepository);
    }

    @Test
    void rejectsDuplicateUserAndEmailAliasesAsOneAtomicBatch() {
        var owner = new User();
        var signer = new User();
        signer.setUsername("Alice@Example.test");
        var session = new WorkflowSession();
        session.setOwner(owner);
        when(workflowSessionRepository.findBySessionIdForUpdate("session"))
                .thenReturn(Optional.of(session));
        when(userRepository.findById(7L)).thenReturn(Optional.of(signer));
        var registered = new ParticipantRequest();
        registered.setUserId(7L);
        var email = new ParticipantRequest();
        email.setEmail(" alice@example.TEST ");
        assertThatThrownBy(
                        () -> service.addParticipants("session", List.of(registered, email), owner))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("only be added once");
        verifyNoInteractions(workflowParticipantRepository);
    }

    @Test
    void rejectsAnAlreadyInvitedParticipant() {
        var owner = new User();
        var session = new WorkflowSession();
        session.setOwner(owner);
        var existing = new WorkflowParticipant();
        existing.setEmail("alice@example.test");
        session.addParticipant(existing);
        when(workflowSessionRepository.findBySessionIdForUpdate("session"))
                .thenReturn(Optional.of(session));
        var request = new ParticipantRequest();
        request.setEmail("ALICE@example.test");
        assertThatThrownBy(() -> service.addParticipants("session", List.of(request), owner))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("only be added once");
        verifyNoInteractions(workflowParticipantRepository);
    }

    private MockMultipartFile invalidPdf() {
        return new MockMultipartFile(
                "file", "renamed.pdf", "application/pdf", "not a PDF".getBytes());
    }
}
