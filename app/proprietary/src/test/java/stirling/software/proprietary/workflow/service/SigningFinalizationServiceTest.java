package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfSigningService;
import stirling.software.common.service.ServerCertificateServiceInterface;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;

import tools.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
class SigningFinalizationServiceTest {

    @Mock private WorkflowParticipantRepository participantRepository;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private ObjectMapper objectMapper;
    @Mock private PdfSigningService pdfSigningService;
    @Mock private MetadataEncryptionService metadataEncryptionService;
    @Mock private ServerCertificateServiceInterface serverCertificateService;
    @Mock private UserServerCertificateService userServerCertificateService;

    @InjectMocks private SigningFinalizationService service;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private WorkflowSession sessionWithParticipants(WorkflowParticipant... participants) {
        WorkflowSession session = new WorkflowSession();
        session.setSessionId("test-session");
        List<WorkflowParticipant> list = new ArrayList<>();
        for (WorkflowParticipant p : participants) {
            list.add(p);
        }
        session.setParticipants(list);
        return session;
    }

    private WorkflowParticipant participantWithMetadata(Map<String, Object> metadata) {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setStatus(ParticipantStatus.SIGNED);
        p.setEmail("test@example.com");
        p.setParticipantMetadata(new HashMap<>(metadata));
        return p;
    }

    // -------------------------------------------------------------------------
    // clearSensitiveMetadata — individual key removal
    // -------------------------------------------------------------------------

    @Test
    void clearSensitiveMetadata_removesWetSignaturesKey() {
        WorkflowParticipant p =
                participantWithMetadata(Map.of("wetSignatures", List.of("sig1"), "other", "keep"));
        WorkflowSession session = sessionWithParticipants(p);

        service.clearSensitiveMetadata(session);

        assertThat(p.getParticipantMetadata()).doesNotContainKey("wetSignatures");
        assertThat(p.getParticipantMetadata()).containsKey("other");
        verify(participantRepository, times(1)).save(p);
    }

    @Test
    void clearSensitiveMetadata_removesCertificateSubmissionKey() {
        WorkflowParticipant p =
                participantWithMetadata(
                        Map.of("certificateSubmission", Map.of("certType", "SERVER")));
        WorkflowSession session = sessionWithParticipants(p);

        service.clearSensitiveMetadata(session);

        assertThat(p.getParticipantMetadata()).doesNotContainKey("certificateSubmission");
        verify(participantRepository, times(1)).save(p);
    }

    @Test
    void clearSensitiveMetadata_removesBothKeys_savesOnce() {
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("wetSignatures", List.of("sig1"));
        metadata.put("certificateSubmission", Map.of("certType", "SERVER"));
        metadata.put("showLogo", true);
        WorkflowParticipant p = participantWithMetadata(metadata);
        WorkflowSession session = sessionWithParticipants(p);

        service.clearSensitiveMetadata(session);

        assertThat(p.getParticipantMetadata()).doesNotContainKey("wetSignatures");
        assertThat(p.getParticipantMetadata()).doesNotContainKey("certificateSubmission");
        assertThat(p.getParticipantMetadata()).containsKey("showLogo");
        verify(participantRepository, times(1)).save(p);
    }

    // -------------------------------------------------------------------------
    // clearSensitiveMetadata — no-op cases (save must NOT be called)
    // -------------------------------------------------------------------------

    @Test
    void clearSensitiveMetadata_noSensitiveKeys_doesNotSave() {
        WorkflowParticipant p = participantWithMetadata(Map.of("showLogo", true, "pageNumber", 1));
        WorkflowSession session = sessionWithParticipants(p);

        service.clearSensitiveMetadata(session);

        verify(participantRepository, never()).save(any());
    }

    @Test
    void clearSensitiveMetadata_nullMetadata_doesNotSave() {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setStatus(ParticipantStatus.SIGNED);
        p.setParticipantMetadata(null);
        WorkflowSession session = sessionWithParticipants(p);

        service.clearSensitiveMetadata(session);

        verify(participantRepository, never()).save(any());
    }

    @Test
    void clearSensitiveMetadata_emptyMetadata_doesNotSave() {
        WorkflowParticipant p = participantWithMetadata(Map.of());
        WorkflowSession session = sessionWithParticipants(p);

        service.clearSensitiveMetadata(session);

        verify(participantRepository, never()).save(any());
    }

    // -------------------------------------------------------------------------
    // clearSensitiveMetadata — multiple participants
    // -------------------------------------------------------------------------

    @Test
    void clearSensitiveMetadata_multipleParticipants_allWithSensitiveData_allCleared() {
        WorkflowParticipant p1 = participantWithMetadata(Map.of("wetSignatures", List.of("s1")));
        WorkflowParticipant p2 =
                participantWithMetadata(Map.of("certificateSubmission", Map.of("k", "v")));
        WorkflowParticipant p3 =
                participantWithMetadata(Map.of("wetSignatures", List.of("s3"), "extra", "keep"));
        WorkflowSession session = sessionWithParticipants(p1, p2, p3);

        service.clearSensitiveMetadata(session);

        assertThat(p1.getParticipantMetadata()).doesNotContainKey("wetSignatures");
        assertThat(p2.getParticipantMetadata()).doesNotContainKey("certificateSubmission");
        assertThat(p3.getParticipantMetadata()).doesNotContainKey("wetSignatures");
        assertThat(p3.getParticipantMetadata()).containsKey("extra");
        verify(participantRepository, times(3)).save(any());
    }

    @Test
    void clearSensitiveMetadata_mixedParticipants_onlySavesModified() {
        WorkflowParticipant withSensitive =
                participantWithMetadata(Map.of("wetSignatures", List.of("s1")));
        WorkflowParticipant withoutSensitive = participantWithMetadata(Map.of("showLogo", false));
        WorkflowSession session = sessionWithParticipants(withSensitive, withoutSensitive);

        service.clearSensitiveMetadata(session);

        verify(participantRepository, times(1)).save(withSensitive);
        verify(participantRepository, never()).save(withoutSensitive);
    }
}
