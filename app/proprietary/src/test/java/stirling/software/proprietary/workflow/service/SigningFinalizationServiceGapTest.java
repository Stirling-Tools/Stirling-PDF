package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfSigningService;
import stirling.software.common.service.ServerCertificateServiceInterface;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Companion gap-coverage tests for {@link SigningFinalizationService}. The existing
 * SigningFinalizationServiceTest only exercises {@code clearSensitiveMetadata}; this file drives
 * the {@code finalizeDocument} pipeline to cover the wet-signature, summary-page, and
 * digital-signature branches (keystore building, certificate-type dispatch, participant skipping).
 *
 * <p>A real (non-mocked) Jackson ObjectMapper is used so the private {@code
 * extractCertificateSubmission}/{@code extractParticipantSignatureMetadata} JSON parsing runs for
 * real. All slow boundaries (PDF load, signing, crypto keygen) are mocked: keystores are empty
 * in-memory PKCS12 stores built without key generation, and the signing service is a mock.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SigningFinalizationServiceGapTest {

    @Mock private WorkflowParticipantRepository participantRepository;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private PdfSigningService pdfSigningService;
    @Mock private MetadataEncryptionService metadataEncryptionService;
    @Mock private ServerCertificateServiceInterface serverCertificateService;
    @Mock private UserServerCertificateService userServerCertificateService;

    // Real mapper so JSON tree parsing in extractCertificateSubmission works for real.
    private final ObjectMapper objectMapper = JsonMapper.builder().build();

    private SigningFinalizationService service;

    private static final byte[] ORIGINAL_PDF = "%PDF-1.4 original".getBytes();
    private static final byte[] SIGNED_PDF = "%PDF-1.4 signed".getBytes();

    @BeforeEach
    void setUp() {
        service =
                new SigningFinalizationService(
                        participantRepository,
                        pdfDocumentFactory,
                        objectMapper,
                        pdfSigningService,
                        metadataEncryptionService,
                        serverCertificateService,
                        userServerCertificateService);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private WorkflowSession sessionWith(WorkflowParticipant... participants) {
        WorkflowSession session = new WorkflowSession();
        session.setSessionId("gap-session");
        session.setDocumentName("contract.pdf");
        User owner = new User();
        owner.setUsername("owner@example.com");
        session.setOwner(owner);
        List<WorkflowParticipant> list = new ArrayList<>();
        for (WorkflowParticipant p : participants) {
            list.add(p);
        }
        session.setParticipants(list);
        return session;
    }

    private WorkflowParticipant participant(Long id, ParticipantStatus status) {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setId(id);
        p.setStatus(status);
        p.setEmail("p" + id + "@example.com");
        p.setName("Participant " + id);
        p.setParticipantMetadata(new HashMap<>());
        return p;
    }

    /** Empty PKCS12 keystore — no key generation, instant to build. */
    private KeyStore emptyP12() throws Exception {
        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(null, null);
        return ks;
    }

    /** Fresh real one-page PDF document bytes (no rendering). */
    private byte[] onePagePdf() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private Map<String, Object> certSubmissionMetadata(String certType) {
        Map<String, Object> cert = new HashMap<>();
        cert.put("certType", certType);
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("certificateSubmission", cert);
        return metadata;
    }

    // -------------------------------------------------------------------------
    // finalizeDocument — early-exit / participant skipping branches
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("finalizeDocument participant dispatch")
    class FinalizeDispatch {

        @Test
        @DisplayName("no wet signatures + no signed participants returns original bytes untouched")
        void noWetSignatures_noSignedParticipants_returnsOriginal() throws Exception {
            WorkflowParticipant pending = participant(1L, ParticipantStatus.PENDING);
            WorkflowSession session = sessionWith(pending);
            when(participantRepository.findById(1L)).thenReturn(Optional.of(pending));

            byte[] result = service.finalizeDocument(session, ORIGINAL_PDF);

            assertThat(result).isEqualTo(ORIGINAL_PDF);
            // Never loaded a PDDocument because there were no wet signatures.
            verify(pdfDocumentFactory, never()).load(any(InputStream.class));
            // No signing because the participant is not SIGNED.
            verify(pdfSigningService, never())
                    .signWithKeystore(
                            any(),
                            any(),
                            any(),
                            anyBoolean(),
                            any(),
                            any(),
                            any(),
                            any(),
                            anyBoolean());
        }

        @Test
        @DisplayName("SIGNED participant missing from DB throws 500")
        void signedParticipant_notFoundOnReload_throws500() {
            WorkflowParticipant signed = participant(7L, ParticipantStatus.SIGNED);
            WorkflowSession session = sessionWith(signed);
            // First lookup (wet-signature pass) succeeds; the digital pass re-reads and must fail.
            when(participantRepository.findById(7L))
                    .thenReturn(Optional.of(signed))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.finalizeDocument(session, ORIGINAL_PDF))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("Participant not found: 7")
                    .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                    .isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        }

        @Test
        @DisplayName(
                "SIGNED participant with no certificateSubmission is skipped, returns original")
        void signedParticipant_noCertSubmission_skipped() throws Exception {
            WorkflowParticipant signed = participant(3L, ParticipantStatus.SIGNED);
            WorkflowSession session = sessionWith(signed);
            when(participantRepository.findById(3L)).thenReturn(Optional.of(signed));

            byte[] result = service.finalizeDocument(session, ORIGINAL_PDF);

            assertThat(result).isEqualTo(ORIGINAL_PDF);
            verify(pdfSigningService, never())
                    .signWithKeystore(
                            any(),
                            any(),
                            any(),
                            anyBoolean(),
                            any(),
                            any(),
                            any(),
                            any(),
                            anyBoolean());
        }
    }

    // -------------------------------------------------------------------------
    // finalizeDocument — SERVER certificate digital signing happy path
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("digital signing via SERVER certificate")
    class ServerCertSigning {

        @Test
        @DisplayName(
                "SIGNED participant with SERVER cert invokes signing service and returns its output")
        void serverCert_signsAndReturnsSignedBytes() throws Exception {
            WorkflowParticipant signed = participant(5L, ParticipantStatus.SIGNED);
            signed.setParticipantMetadata(certSubmissionMetadata("SERVER"));
            WorkflowSession session = sessionWith(signed);

            when(participantRepository.findById(5L)).thenReturn(Optional.of(signed));
            when(serverCertificateService.isEnabled()).thenReturn(true);
            when(serverCertificateService.hasServerCertificate()).thenReturn(true);
            when(serverCertificateService.getServerKeyStore()).thenReturn(emptyP12());
            when(serverCertificateService.getServerCertificatePassword()).thenReturn("serverpw");
            when(pdfSigningService.signWithKeystore(
                            any(),
                            any(),
                            any(),
                            anyBoolean(),
                            any(),
                            any(),
                            any(),
                            any(),
                            anyBoolean()))
                    .thenReturn(SIGNED_PDF);

            byte[] result = service.finalizeDocument(session, ORIGINAL_PDF);

            assertThat(result).isEqualTo(SIGNED_PDF);
            verify(pdfSigningService, times(1))
                    .signWithKeystore(
                            any(),
                            any(),
                            any(),
                            anyBoolean(),
                            any(),
                            any(),
                            any(),
                            any(),
                            anyBoolean());
        }

        @Test
        @DisplayName("default reason and password supplied to signing service when none provided")
        void serverCert_defaultsReasonAndPassword() throws Exception {
            WorkflowParticipant signed = participant(9L, ParticipantStatus.SIGNED);
            signed.setName("Jane Doe");
            signed.setParticipantMetadata(certSubmissionMetadata("SERVER"));
            WorkflowSession session = sessionWith(signed);

            when(participantRepository.findById(9L)).thenReturn(Optional.of(signed));
            when(serverCertificateService.isEnabled()).thenReturn(true);
            when(serverCertificateService.hasServerCertificate()).thenReturn(true);
            when(serverCertificateService.getServerKeyStore()).thenReturn(emptyP12());
            when(serverCertificateService.getServerCertificatePassword()).thenReturn("serverpw");
            when(pdfSigningService.signWithKeystore(
                            any(),
                            any(),
                            any(),
                            anyBoolean(),
                            any(),
                            any(),
                            any(),
                            any(),
                            anyBoolean()))
                    .thenReturn(SIGNED_PDF);

            service.finalizeDocument(session, ORIGINAL_PDF);

            ArgumentCaptor<char[]> pwCaptor = ArgumentCaptor.forClass(char[].class);
            ArgumentCaptor<String> nameCaptor = ArgumentCaptor.forClass(String.class);
            ArgumentCaptor<String> reasonCaptor = ArgumentCaptor.forClass(String.class);
            verify(pdfSigningService)
                    .signWithKeystore(
                            eq(ORIGINAL_PDF),
                            any(KeyStore.class),
                            pwCaptor.capture(),
                            anyBoolean(),
                            isNull(), // pageNumber null -> stays null (no -1 applied)
                            nameCaptor.capture(),
                            any(),
                            reasonCaptor.capture(),
                            anyBoolean());
            assertThat(new String(pwCaptor.getValue())).isEqualTo("serverpw");
            assertThat(nameCaptor.getValue()).isEqualTo("Jane Doe");
            assertThat(reasonCaptor.getValue()).isEqualTo("Document Signing");
        }

        @Test
        @DisplayName(
                "includeSummaryPage suppresses the visible signature block (showSignature=false)")
        void summaryPageEnabled_suppressesVisibleSignature() throws Exception {
            WorkflowParticipant signed = participant(11L, ParticipantStatus.SIGNED);
            signed.setParticipantMetadata(certSubmissionMetadata("SERVER"));
            WorkflowSession session = sessionWith(signed);
            Map<String, Object> wf = new HashMap<>();
            wf.put("includeSummaryPage", true);
            wf.put("showSignature", true);
            session.setWorkflowMetadata(wf);

            when(participantRepository.findById(11L)).thenReturn(Optional.of(signed));
            when(serverCertificateService.isEnabled()).thenReturn(true);
            when(serverCertificateService.hasServerCertificate()).thenReturn(true);
            when(serverCertificateService.getServerKeyStore()).thenReturn(emptyP12());
            when(serverCertificateService.getServerCertificatePassword()).thenReturn("pw");
            // Summary page generation loads the original PDF.
            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(onePagePdf()));
            when(pdfSigningService.signWithKeystore(
                            any(),
                            any(),
                            any(),
                            anyBoolean(),
                            any(),
                            any(),
                            any(),
                            any(),
                            anyBoolean()))
                    .thenReturn(SIGNED_PDF);

            service.finalizeDocument(session, ORIGINAL_PDF);

            ArgumentCaptor<Boolean> showCaptor = ArgumentCaptor.forClass(Boolean.class);
            verify(pdfSigningService)
                    .signWithKeystore(
                            any(),
                            any(),
                            any(),
                            showCaptor.capture(),
                            any(),
                            any(),
                            any(),
                            any(),
                            anyBoolean());
            assertThat(showCaptor.getValue()).isFalse();
        }

        @Test
        @DisplayName("pageNumber from session settings is converted to 0-indexed for signing")
        void pageNumber_convertedToZeroIndexed() throws Exception {
            WorkflowParticipant signed = participant(13L, ParticipantStatus.SIGNED);
            signed.setParticipantMetadata(certSubmissionMetadata("SERVER"));
            WorkflowSession session = sessionWith(signed);
            Map<String, Object> wf = new HashMap<>();
            wf.put("pageNumber", 3);
            wf.put("showSignature", true);
            session.setWorkflowMetadata(wf);

            when(participantRepository.findById(13L)).thenReturn(Optional.of(signed));
            when(serverCertificateService.isEnabled()).thenReturn(true);
            when(serverCertificateService.hasServerCertificate()).thenReturn(true);
            when(serverCertificateService.getServerKeyStore()).thenReturn(emptyP12());
            when(serverCertificateService.getServerCertificatePassword()).thenReturn("pw");
            when(pdfSigningService.signWithKeystore(
                            any(),
                            any(),
                            any(),
                            anyBoolean(),
                            any(),
                            any(),
                            any(),
                            any(),
                            anyBoolean()))
                    .thenReturn(SIGNED_PDF);

            service.finalizeDocument(session, ORIGINAL_PDF);

            ArgumentCaptor<Integer> pageCaptor = ArgumentCaptor.forClass(Integer.class);
            verify(pdfSigningService)
                    .signWithKeystore(
                            any(),
                            any(),
                            any(),
                            anyBoolean(),
                            pageCaptor.capture(),
                            any(),
                            any(),
                            any(),
                            anyBoolean());
            assertThat(pageCaptor.getValue()).isEqualTo(2); // 3 - 1
        }
    }

    // -------------------------------------------------------------------------
    // buildKeystore certificate-type dispatch (error branches)
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("buildKeystore error branches via finalizeDocument")
    class BuildKeystoreErrors {

        private WorkflowSession singleSignedSessionWithCert(
                String certType, Map<String, Object> extraCert) {
            WorkflowParticipant signed = participant(20L, ParticipantStatus.SIGNED);
            Map<String, Object> cert = new HashMap<>();
            cert.put("certType", certType);
            if (extraCert != null) {
                cert.putAll(extraCert);
            }
            Map<String, Object> metadata = new HashMap<>();
            metadata.put("certificateSubmission", cert);
            signed.setParticipantMetadata(metadata);
            when(participantRepository.findById(20L)).thenReturn(Optional.of(signed));
            return sessionWith(signed);
        }

        @Test
        @DisplayName("P12 cert type with no keystore bytes -> BAD_REQUEST")
        void p12_missingKeystore_badRequest() {
            WorkflowSession session = singleSignedSessionWithCert("P12", null);

            assertThatThrownBy(() -> service.finalizeDocument(session, ORIGINAL_PDF))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("P12 keystore data is required")
                    .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("JKS cert type with no keystore bytes -> BAD_REQUEST")
        void jks_missingKeystore_badRequest() {
            WorkflowSession session = singleSignedSessionWithCert("JKS", null);

            assertThatThrownBy(() -> service.finalizeDocument(session, ORIGINAL_PDF))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("JKS keystore data is required")
                    .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("P12 cert type with invalid keystore bytes -> BAD_REQUEST (open failure)")
        void p12_invalidKeystore_badRequest() {
            // base64 of garbage bytes so extractCertificateSubmission decodes them into p12Keystore
            String junkB64 =
                    java.util.Base64.getEncoder().encodeToString("not-a-keystore".getBytes());
            Map<String, Object> extra = new HashMap<>();
            extra.put("p12Keystore", junkB64);
            WorkflowSession session = singleSignedSessionWithCert("P12", extra);

            assertThatThrownBy(() -> service.finalizeDocument(session, ORIGINAL_PDF))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("Failed to open P12 keystore")
                    .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("unknown cert type -> BAD_REQUEST invalid certificate type")
        void unknownCertType_badRequest() {
            WorkflowSession session = singleSignedSessionWithCert("SOMETHING_ELSE", null);

            assertThatThrownBy(() -> service.finalizeDocument(session, ORIGINAL_PDF))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("Invalid certificate type: SOMETHING_ELSE")
                    .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("SERVER cert type but service reports disabled -> BAD_REQUEST")
        void serverCert_disabled_badRequest() {
            WorkflowSession session = singleSignedSessionWithCert("SERVER", null);
            when(serverCertificateService.isEnabled()).thenReturn(false);

            assertThatThrownBy(() -> service.finalizeDocument(session, ORIGINAL_PDF))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("Server certificate is not available")
                    .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("SERVER cert enabled but no server certificate present -> BAD_REQUEST")
        void serverCert_enabledButNoCert_badRequest() {
            WorkflowSession session = singleSignedSessionWithCert("SERVER", null);
            when(serverCertificateService.isEnabled()).thenReturn(true);
            when(serverCertificateService.hasServerCertificate()).thenReturn(false);

            assertThatThrownBy(() -> service.finalizeDocument(session, ORIGINAL_PDF))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("Server certificate is not available")
                    .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("USER_CERT but participant has no authenticated user -> BAD_REQUEST")
        void userCert_noUser_badRequest() {
            WorkflowSession session = singleSignedSessionWithCert("USER_CERT", null);
            // participant.getUser() is null by default

            assertThatThrownBy(() -> service.finalizeDocument(session, ORIGINAL_PDF))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("User certificate requires authenticated user")
                    .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }
    }

    // -------------------------------------------------------------------------
    // USER_CERT happy path + failure-to-generate branch
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("digital signing via USER_CERT")
    class UserCertSigning {

        @Test
        @DisplayName("USER_CERT with user invokes getOrCreate + getUserKeyStore and signs")
        void userCert_signsWithUserKeystore() throws Exception {
            WorkflowParticipant signed = participant(30L, ParticipantStatus.SIGNED);
            signed.setParticipantMetadata(certSubmissionMetadata("USER_CERT"));
            User user = new User();
            user.setId(99L);
            user.setUsername("signer");
            signed.setUser(user);
            WorkflowSession session = sessionWith(signed);

            when(participantRepository.findById(30L)).thenReturn(Optional.of(signed));
            when(userServerCertificateService.getUserKeyStore(99L)).thenReturn(emptyP12());
            when(userServerCertificateService.getUserKeystorePassword(99L)).thenReturn("userpw");
            when(pdfSigningService.signWithKeystore(
                            any(),
                            any(),
                            any(),
                            anyBoolean(),
                            any(),
                            any(),
                            any(),
                            any(),
                            anyBoolean()))
                    .thenReturn(SIGNED_PDF);

            byte[] result = service.finalizeDocument(session, ORIGINAL_PDF);

            assertThat(result).isEqualTo(SIGNED_PDF);
            verify(userServerCertificateService).getOrCreateUserCertificate(99L);
            verify(userServerCertificateService).getUserKeyStore(99L);
        }

        @Test
        @DisplayName("USER_CERT keystore retrieval failure -> 500 wrapped ResponseStatusException")
        void userCert_keystoreFailure_throws500() throws Exception {
            WorkflowParticipant signed = participant(31L, ParticipantStatus.SIGNED);
            signed.setParticipantMetadata(certSubmissionMetadata("USER_CERT"));
            User user = new User();
            user.setId(42L);
            user.setUsername("signer");
            signed.setUser(user);
            WorkflowSession session = sessionWith(signed);

            when(participantRepository.findById(31L)).thenReturn(Optional.of(signed));
            when(userServerCertificateService.getUserKeyStore(42L))
                    .thenThrow(new IllegalStateException("boom"));

            assertThatThrownBy(() -> service.finalizeDocument(session, ORIGINAL_PDF))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("Failed to generate or retrieve user certificate")
                    .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                    .isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // -------------------------------------------------------------------------
    // Wet-signature pass — out-of-range page is skipped, PDF still saved
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("wet signature application")
    class WetSignatures {

        private Map<String, Object> wetSig(int page, double x, double y, double w, double h) {
            Map<String, Object> sig = new HashMap<>();
            sig.put("type", "image");
            sig.put("data", "data:image/png;base64,iVBORw0KGgo=");
            sig.put("page", page);
            sig.put("x", x);
            sig.put("y", y);
            sig.put("width", w);
            sig.put("height", h);
            return sig;
        }

        @Test
        @DisplayName("wet signature on an out-of-range page is skipped; document is reloaded/saved")
        void wetSignature_pageOutOfRange_skippedButDocumentSaved() throws Exception {
            WorkflowParticipant p = participant(40L, ParticipantStatus.VIEWED);
            Map<String, Object> metadata = new HashMap<>();
            // single page doc, but signature targets page index 5 -> skipped
            metadata.put("wetSignatures", List.of(wetSig(5, 0.1, 0.1, 0.2, 0.1)));
            p.setParticipantMetadata(metadata);
            WorkflowSession session = sessionWith(p);

            when(participantRepository.findById(40L)).thenReturn(Optional.of(p));
            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(onePagePdf()));

            byte[] result = service.finalizeDocument(session, ORIGINAL_PDF);

            // Document was loaded and re-saved (so result differs from the raw original bytes).
            assertThat(result).isNotNull();
            assertThat(result).isNotEqualTo(ORIGINAL_PDF);
            verify(pdfDocumentFactory, times(1)).load(any(InputStream.class));
            // Participant is VIEWED, not SIGNED -> no digital signing.
            verify(pdfSigningService, never())
                    .signWithKeystore(
                            any(),
                            any(),
                            any(),
                            anyBoolean(),
                            any(),
                            any(),
                            any(),
                            any(),
                            anyBoolean());
        }

        @Test
        @DisplayName("wetSignatures stored as a non-List value is ignored, no PDF load")
        void wetSignatures_notAList_ignored() throws Exception {
            WorkflowParticipant p = participant(41L, ParticipantStatus.VIEWED);
            Map<String, Object> metadata = new HashMap<>();
            metadata.put("wetSignatures", "this-is-not-a-list");
            p.setParticipantMetadata(metadata);
            WorkflowSession session = sessionWith(p);

            when(participantRepository.findById(41L)).thenReturn(Optional.of(p));

            byte[] result = service.finalizeDocument(session, ORIGINAL_PDF);

            assertThat(result).isEqualTo(ORIGINAL_PDF);
            // No valid wet signatures extracted -> never loaded a document.
            verify(pdfDocumentFactory, never()).load(any(InputStream.class));
        }

        @Test
        @DisplayName(
                "reload failure during wet-signature extraction is swallowed, participant skipped")
        void wetSignature_reloadFails_skipped() throws Exception {
            WorkflowParticipant p = participant(42L, ParticipantStatus.VIEWED);
            WorkflowSession session = sessionWith(p);
            // Wet-signature pass reload returns empty -> RuntimeException caught internally.
            when(participantRepository.findById(42L)).thenReturn(Optional.empty());

            byte[] result = service.finalizeDocument(session, ORIGINAL_PDF);

            assertThat(result).isEqualTo(ORIGINAL_PDF);
            verify(pdfDocumentFactory, never()).load(any(InputStream.class));
        }
    }

    // -------------------------------------------------------------------------
    // clearSensitiveMetadata — empty participant list edge
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("clearSensitiveMetadata with no participants is a no-op")
    void clearSensitiveMetadata_emptySession_noSave() {
        WorkflowSession session = sessionWith();

        service.clearSensitiveMetadata(session);

        verify(participantRepository, never()).save(any());
    }
}
