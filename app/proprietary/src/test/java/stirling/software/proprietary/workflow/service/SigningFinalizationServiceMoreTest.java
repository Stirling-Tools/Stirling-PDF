package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
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

/**
 * Gap-filling tests for {@link SigningFinalizationService}, complementing
 * SigningFinalizationServiceTest which only covers clearSensitiveMetadata. Exercises the
 * finalizeDocument pipeline, keystore building, certificate validation, and metadata extraction
 * using real test certificates and an in-memory PDDocument.
 */
@ExtendWith(MockitoExtension.class)
class SigningFinalizationServiceMoreTest {

    @Mock private WorkflowParticipantRepository participantRepository;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private PdfSigningService pdfSigningService;
    @Mock private MetadataEncryptionService metadataEncryptionService;
    @Mock private ServerCertificateServiceInterface serverCertificateService;
    @Mock private UserServerCertificateService userServerCertificateService;

    // Real Jackson 3 mapper so extractCertificateSubmission actually parses metadata
    private final ObjectMapper objectMapper = new ObjectMapper();

    private SigningFinalizationService service;

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
        // Keystores are stored encrypted at rest; these fixtures store them as plain Base64 (the
        // legacy form), which decryptBytes decodes unchanged.
        lenient()
                .when(metadataEncryptionService.decryptBytes(any()))
                .thenAnswer(
                        inv -> {
                            String stored = inv.getArgument(0, String.class);
                            return stored == null ? null : Base64.getDecoder().decode(stored);
                        });
    }

    // -------------------------------------------------------------------------
    // Test fixtures / helpers
    // -------------------------------------------------------------------------

    private static byte[] loadCert(String filename) throws Exception {
        try (InputStream in =
                SigningFinalizationServiceMoreTest.class.getResourceAsStream(
                        "/test-certs/" + filename)) {
            if (in == null) {
                throw new IllegalStateException("cert not found: " + filename);
            }
            return in.readAllBytes();
        }
    }

    /** Builds a single-page in-memory PDF and returns its bytes. */
    private static byte[] singlePagePdf() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    /** Loads the given bytes into a real PDDocument (used to mock the factory). */
    private static PDDocument loadDoc(byte[] bytes) throws Exception {
        return org.apache.pdfbox.Loader.loadPDF(bytes);
    }

    /** Tiny valid PNG data-URL so PDImageXObject.createFromByteArray succeeds. */
    private static String pngDataUrl() throws Exception {
        BufferedImage img = new BufferedImage(8, 8, BufferedImage.TYPE_INT_ARGB);
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(img, "png", baos);
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(baos.toByteArray());
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

    private WorkflowSession sessionOf(WorkflowParticipant... ps) {
        WorkflowSession session = new WorkflowSession();
        session.setSessionId("sess-1");
        session.setDocumentName("contract.pdf");
        List<WorkflowParticipant> list = new ArrayList<>();
        for (WorkflowParticipant p : ps) {
            list.add(p);
        }
        session.setParticipants(list);
        User owner = new User();
        owner.setUsername("owner");
        session.setOwner(owner);
        return session;
    }

    /** Builds participant metadata containing a P12 certificateSubmission with the given cert. */
    private Map<String, Object> p12SubmissionMetadata(byte[] p12Bytes, String password) {
        Map<String, Object> submission = new HashMap<>();
        submission.put("certType", "P12");
        submission.put("password", password);
        submission.put("p12Keystore", Base64.getEncoder().encodeToString(p12Bytes));
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("certificateSubmission", submission);
        return metadata;
    }

    private Map<String, Object> wetSignatureMetadata(String dataUrl, int page) {
        Map<String, Object> sig = new HashMap<>();
        sig.put("type", "image");
        sig.put("data", dataUrl);
        sig.put("page", page);
        sig.put("x", 0.1);
        sig.put("y", 0.1);
        sig.put("width", 0.2);
        sig.put("height", 0.1);
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("wetSignatures", new ArrayList<>(List.of(sig)));
        return metadata;
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("finalizeDocument - digital signature happy path")
    class FinalizeHappyPath {

        @Test
        @DisplayName("signs each SIGNED participant via P12 keystore and returns signed bytes")
        void signsSignedParticipant() throws Exception {
            byte[] p12 = loadCert("valid-test.p12");
            WorkflowParticipant p = participant(1L, ParticipantStatus.SIGNED);
            p.setParticipantMetadata(p12SubmissionMetadata(p12, "testpass"));
            WorkflowSession session = sessionOf(p);

            // No wet signatures -> applyWetSignatures returns input unchanged (factory not used)
            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));
            when(metadataEncryptionService.decrypt("testpass")).thenReturn("testpass");

            byte[] signedOut = "SIGNED-PDF".getBytes();
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
                    .thenReturn(signedOut);

            byte[] original = singlePagePdf();
            byte[] result = service.finalizeDocument(session, original);

            assertThat(result).isEqualTo(signedOut);
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
        @DisplayName("passes participant reason/location and page-1-converted-to-0-indexed")
        void passesReasonLocationAndPageIndex() throws Exception {
            byte[] p12 = loadCert("valid-test.p12");
            WorkflowParticipant p = participant(1L, ParticipantStatus.SIGNED);
            Map<String, Object> metadata = p12SubmissionMetadata(p12, "testpass");
            @SuppressWarnings("unchecked")
            Map<String, Object> sub = (Map<String, Object>) metadata.get("certificateSubmission");
            sub.put("reason", "I approve");
            sub.put("location", "London");
            p.setParticipantMetadata(metadata);

            WorkflowSession session = sessionOf(p);
            session.getWorkflowMetadata().put("pageNumber", 3);
            session.getWorkflowMetadata().put("showSignature", true);

            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));
            when(metadataEncryptionService.decrypt("testpass")).thenReturn("testpass");
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
                    .thenReturn("ok".getBytes());

            service.finalizeDocument(session, singlePagePdf());

            // page 3 (1-indexed) -> 2 (0-indexed); reason/location forwarded
            verify(pdfSigningService)
                    .signWithKeystore(
                            any(),
                            any(),
                            any(),
                            eq(true),
                            eq(2),
                            eq("Participant 1"),
                            eq("London"),
                            eq("I approve"),
                            anyBoolean());
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("finalizeDocument - participant skipping")
    class ParticipantSkipping {

        @Test
        @DisplayName("skips digital signing for participants whose status is not SIGNED")
        void skipsNonSignedParticipant() throws Exception {
            WorkflowParticipant pending = participant(1L, ParticipantStatus.PENDING);
            WorkflowSession session = sessionOf(pending);
            // wet-sig extraction reloads every participant; no wetSignatures key -> skipped
            when(participantRepository.findById(1L)).thenReturn(Optional.of(pending));

            byte[] original = singlePagePdf();
            byte[] result = service.finalizeDocument(session, original);

            // Untouched - no wet sigs, signing skipped because status != SIGNED
            assertThat(result).isEqualTo(original);
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
        @DisplayName("skips SIGNED participant with no certificate submission")
        void skipsSignedParticipantWithoutSubmission() throws Exception {
            WorkflowParticipant p = participant(1L, ParticipantStatus.SIGNED);
            // metadata empty -> extractCertificateSubmission returns null
            WorkflowSession session = sessionOf(p);

            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));

            byte[] original = singlePagePdf();
            byte[] result = service.finalizeDocument(session, original);

            assertThat(result).isEqualTo(original);
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
        @DisplayName("throws 500 when a fresh participant lookup fails")
        void throwsWhenParticipantNotFound() throws Exception {
            WorkflowParticipant p = participant(1L, ParticipantStatus.SIGNED);
            WorkflowSession session = sessionOf(p);
            when(participantRepository.findById(1L)).thenReturn(Optional.empty());

            byte[] original = singlePagePdf();
            assertThatThrownBy(() -> service.finalizeDocument(session, original))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("Participant not found");
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("finalizeDocument - wet signatures")
    class WetSignatures {

        @Test
        @DisplayName("applies a wet signature overlay then returns the re-rendered PDF")
        void appliesWetSignature() throws Exception {
            WorkflowParticipant p = participant(1L, ParticipantStatus.SIGNED);
            p.setParticipantMetadata(wetSignatureMetadata(pngDataUrl(), 0));
            WorkflowSession session = sessionOf(p);

            byte[] original = singlePagePdf();
            // Factory loads the original bytes once for the wet-signature pass
            when(pdfDocumentFactory.load(any(InputStream.class))).thenReturn(loadDoc(original));
            // findById invoked by both extractAllWetSignatures and the signing loop
            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));

            byte[] result = service.finalizeDocument(session, original);

            // wet-sig pass produced a non-empty PDF; signing was skipped (no cert submission)
            assertThat(result).isNotNull();
            assertThat(result.length).isGreaterThan(0);
            verify(pdfDocumentFactory, times(1)).load(any(InputStream.class));
        }

        @Test
        @DisplayName("skips wet signature whose page index exceeds the document")
        void skipsOutOfRangeWetSignaturePage() throws Exception {
            WorkflowParticipant p = participant(1L, ParticipantStatus.SIGNED);
            p.setParticipantMetadata(wetSignatureMetadata(pngDataUrl(), 99));
            WorkflowSession session = sessionOf(p);

            byte[] original = singlePagePdf();
            when(pdfDocumentFactory.load(any(InputStream.class))).thenReturn(loadDoc(original));
            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));

            byte[] result = service.finalizeDocument(session, original);

            assertThat(result).isNotNull();
            verify(pdfDocumentFactory, times(1)).load(any(InputStream.class));
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("finalizeDocument - summary page")
    class SummaryPage {

        @Test
        @DisplayName("appends a summary page when includeSummaryPage is true")
        void appendsSummaryPage() throws Exception {
            byte[] p12 = loadCert("valid-test.p12");
            WorkflowParticipant signed = participant(1L, ParticipantStatus.SIGNED);
            signed.setParticipantMetadata(p12SubmissionMetadata(p12, "testpass"));
            signed.setLastUpdated(java.time.LocalDateTime.now());
            WorkflowParticipant declined = participant(2L, ParticipantStatus.DECLINED);
            WorkflowSession session = sessionOf(signed, declined);
            session.getWorkflowMetadata().put("includeSummaryPage", true);

            byte[] original = singlePagePdf();
            // factory called once for summary-page rendering (no wet sigs present)
            when(pdfDocumentFactory.load(any(InputStream.class))).thenReturn(loadDoc(original));
            when(participantRepository.findById(1L)).thenReturn(Optional.of(signed));
            lenient().when(metadataEncryptionService.decrypt("testpass")).thenReturn("testpass");
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
                    .thenAnswer(inv -> inv.getArgument(0));

            byte[] result = service.finalizeDocument(session, original);

            assertThat(result).isNotNull();
            // showVisualSignature forced to false when summary page enabled
            verify(pdfSigningService)
                    .signWithKeystore(
                            any(),
                            any(),
                            any(),
                            eq(false),
                            any(),
                            any(),
                            any(),
                            any(),
                            anyBoolean());
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("buildKeystore via finalizeDocument - certificate type branches")
    class KeystoreTypeBranches {

        private WorkflowParticipant signedWith(Map<String, Object> metadata) {
            WorkflowParticipant p = participant(1L, ParticipantStatus.SIGNED);
            p.setParticipantMetadata(metadata);
            return p;
        }

        @Test
        @DisplayName("expired P12 certificate is rejected with 400")
        void expiredCertificateRejected() throws Exception {
            byte[] expired = loadCert("expired-test.p12");
            WorkflowParticipant p = signedWith(p12SubmissionMetadata(expired, "testpass"));
            WorkflowSession session = sessionOf(p);

            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));
            when(metadataEncryptionService.decrypt("testpass")).thenReturn("testpass");

            assertThatThrownBy(() -> service.finalizeDocument(session, singlePagePdf()))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("expired");
        }

        @Test
        @DisplayName("not-yet-valid P12 certificate is rejected with 400")
        void notYetValidCertificateRejected() throws Exception {
            byte[] notYet = loadCert("not-yet-valid-test.p12");
            WorkflowParticipant p = signedWith(p12SubmissionMetadata(notYet, "testpass"));
            WorkflowSession session = sessionOf(p);

            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));
            when(metadataEncryptionService.decrypt("testpass")).thenReturn("testpass");

            assertThatThrownBy(() -> service.finalizeDocument(session, singlePagePdf()))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("not yet valid");
        }

        @Test
        @DisplayName("wrong password on P12 keystore is rejected with 400")
        void wrongPasswordRejected() throws Exception {
            byte[] p12 = loadCert("valid-test.p12");
            WorkflowParticipant p = signedWith(p12SubmissionMetadata(p12, "wrong-pass"));
            WorkflowSession session = sessionOf(p);

            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));
            when(metadataEncryptionService.decrypt("wrong-pass")).thenReturn("wrong-pass");

            assertThatThrownBy(() -> service.finalizeDocument(session, singlePagePdf()))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("Failed to open P12 keystore");
        }

        @Test
        @DisplayName("P12 type without keystore bytes is rejected with 400")
        void missingP12BytesRejected() throws Exception {
            Map<String, Object> submission = new HashMap<>();
            submission.put("certType", "P12");
            submission.put("password", "x");
            Map<String, Object> metadata = new HashMap<>();
            metadata.put("certificateSubmission", submission);
            WorkflowParticipant p = signedWith(metadata);
            WorkflowSession session = sessionOf(p);

            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));
            lenient().when(metadataEncryptionService.decrypt("x")).thenReturn("x");

            assertThatThrownBy(() -> service.finalizeDocument(session, singlePagePdf()))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("P12 keystore data is required");
        }

        @Test
        @DisplayName("JKS keystore is loaded and signed")
        void jksKeystoreLoaded() throws Exception {
            byte[] jks = loadCert("valid-test.jks");
            Map<String, Object> submission = new HashMap<>();
            submission.put("certType", "JKS");
            submission.put("password", "jkspass");
            submission.put("jksKeystore", Base64.getEncoder().encodeToString(jks));
            Map<String, Object> metadata = new HashMap<>();
            metadata.put("certificateSubmission", submission);
            WorkflowParticipant p = signedWith(metadata);
            WorkflowSession session = sessionOf(p);

            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));
            when(metadataEncryptionService.decrypt("jkspass")).thenReturn("jkspass");
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
                    .thenReturn("jks-signed".getBytes());

            byte[] result = service.finalizeDocument(session, singlePagePdf());

            assertThat(result).isEqualTo("jks-signed".getBytes());
        }

        @Test
        @DisplayName("JKS type without keystore bytes is rejected with 400")
        void missingJksBytesRejected() throws Exception {
            Map<String, Object> submission = new HashMap<>();
            submission.put("certType", "JKS");
            submission.put("password", "x");
            Map<String, Object> metadata = new HashMap<>();
            metadata.put("certificateSubmission", submission);
            WorkflowParticipant p = signedWith(metadata);
            WorkflowSession session = sessionOf(p);

            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));
            lenient().when(metadataEncryptionService.decrypt("x")).thenReturn("x");

            assertThatThrownBy(() -> service.finalizeDocument(session, singlePagePdf()))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("JKS keystore data is required");
        }

        @Test
        @DisplayName("unknown certificate type is rejected with 400")
        void unknownCertTypeRejected() throws Exception {
            Map<String, Object> submission = new HashMap<>();
            submission.put("certType", "BOGUS");
            Map<String, Object> metadata = new HashMap<>();
            metadata.put("certificateSubmission", submission);
            WorkflowParticipant p = signedWith(metadata);
            WorkflowSession session = sessionOf(p);

            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));

            assertThatThrownBy(() -> service.finalizeDocument(session, singlePagePdf()))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("Invalid certificate type");
        }

        @Test
        @DisplayName("SERVER cert type uses the server keystore and password")
        void serverCertTypeUsesServerKeystore() throws Exception {
            byte[] p12 = loadCert("valid-test.p12");
            java.security.KeyStore serverKs = java.security.KeyStore.getInstance("PKCS12");
            serverKs.load(new ByteArrayInputStream(p12), "testpass".toCharArray());

            Map<String, Object> submission = new HashMap<>();
            submission.put("certType", "SERVER");
            Map<String, Object> metadata = new HashMap<>();
            metadata.put("certificateSubmission", submission);
            WorkflowParticipant p = signedWith(metadata);
            WorkflowSession session = sessionOf(p);

            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));
            when(serverCertificateService.isEnabled()).thenReturn(true);
            when(serverCertificateService.hasServerCertificate()).thenReturn(true);
            when(serverCertificateService.getServerKeyStore()).thenReturn(serverKs);
            when(serverCertificateService.getServerCertificatePassword()).thenReturn("testpass");
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
                    .thenReturn("server-signed".getBytes());

            byte[] result = service.finalizeDocument(session, singlePagePdf());

            assertThat(result).isEqualTo("server-signed".getBytes());
            verify(serverCertificateService).getServerKeyStore();
        }

        @Test
        @DisplayName("SERVER cert type without a configured server certificate is rejected")
        void serverCertTypeNotConfiguredRejected() throws Exception {
            Map<String, Object> submission = new HashMap<>();
            submission.put("certType", "SERVER");
            Map<String, Object> metadata = new HashMap<>();
            metadata.put("certificateSubmission", submission);
            WorkflowParticipant p = signedWith(metadata);
            WorkflowSession session = sessionOf(p);

            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));
            when(serverCertificateService.isEnabled()).thenReturn(false);

            assertThatThrownBy(() -> service.finalizeDocument(session, singlePagePdf()))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("Server certificate is not available");
        }

        @Test
        @DisplayName("USER_CERT type without an authenticated user is rejected")
        void userCertWithoutUserRejected() throws Exception {
            Map<String, Object> submission = new HashMap<>();
            submission.put("certType", "USER_CERT");
            Map<String, Object> metadata = new HashMap<>();
            metadata.put("certificateSubmission", submission);
            WorkflowParticipant p = signedWith(metadata);
            p.setUser(null);
            WorkflowSession session = sessionOf(p);

            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));

            assertThatThrownBy(() -> service.finalizeDocument(session, singlePagePdf()))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("User certificate requires authenticated user");
        }

        @Test
        @DisplayName("USER_CERT type loads the per-user keystore and password")
        void userCertLoadsUserKeystore() throws Exception {
            byte[] p12 = loadCert("valid-test.p12");
            java.security.KeyStore userKs = java.security.KeyStore.getInstance("PKCS12");
            userKs.load(new ByteArrayInputStream(p12), "testpass".toCharArray());

            Map<String, Object> submission = new HashMap<>();
            submission.put("certType", "USER_CERT");
            Map<String, Object> metadata = new HashMap<>();
            metadata.put("certificateSubmission", submission);
            WorkflowParticipant p = signedWith(metadata);
            User u = new User();
            u.setId(42L);
            p.setUser(u);
            WorkflowSession session = sessionOf(p);

            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));
            when(userServerCertificateService.getUserKeyStore(42L)).thenReturn(userKs);
            when(userServerCertificateService.getUserKeystorePassword(42L)).thenReturn("testpass");
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
                    .thenReturn("user-signed".getBytes());

            byte[] result = service.finalizeDocument(session, singlePagePdf());

            assertThat(result).isEqualTo("user-signed".getBytes());
            verify(userServerCertificateService).getOrCreateUserCertificate(42L);
            verify(userServerCertificateService).getUserKeyStore(42L);
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("extractCertificateSubmission - password decryption")
    class SubmissionDecryption {

        @Test
        @DisplayName("decrypts the submission password before signing")
        void decryptsPassword() throws Exception {
            byte[] p12 = loadCert("valid-test.p12");
            WorkflowParticipant p = participant(1L, ParticipantStatus.SIGNED);
            // stored password is an encrypted token; decrypt() resolves it to the real one
            p.setParticipantMetadata(p12SubmissionMetadata(p12, "enc:token"));
            WorkflowSession session = sessionOf(p);

            when(participantRepository.findById(1L)).thenReturn(Optional.of(p));
            when(metadataEncryptionService.decrypt("enc:token")).thenReturn("testpass");
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
                    .thenReturn("ok".getBytes());

            byte[] result = service.finalizeDocument(session, singlePagePdf());

            assertThat(result).isEqualTo("ok".getBytes());
            verify(metadataEncryptionService).decrypt("enc:token");
        }
    }
}
