package stirling.software.SPDF.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.api.security.CreateSigningSessionRequest;
import stirling.software.common.model.api.security.NotifySigningParticipantsRequest;
import stirling.software.common.model.api.security.ParticipantCertificateRequest;
import stirling.software.common.model.api.security.ParticipantCertificateSubmission;
import stirling.software.common.model.api.security.ParticipantStatus;
import stirling.software.common.model.api.security.SigningParticipant;
import stirling.software.common.model.api.security.SigningSession;
import stirling.software.common.service.SigningSessionServiceInterface;
import stirling.software.common.util.ExceptionUtils;

@Service
public class SigningSessionService implements SigningSessionServiceInterface {

    private final Map<String, SigningSession> sessions = new ConcurrentHashMap<>();

    public SigningSession createSession(CreateSigningSessionRequest request) throws IOException {
        return createSession(request, null);
    }

    @Override
    public SigningSession createSession(Object requestObj, String username) throws IOException {
        CreateSigningSessionRequest request = (CreateSigningSessionRequest) requestObj;
        if (request.getParticipantEmails() == null || request.getParticipantEmails().isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.optionsNotSpecified",
                    "{0} options are not specified",
                    "participant emails");
        }

        SigningSession session = new SigningSession();
        session.setDocumentName(request.getFileInput().getOriginalFilename());
        session.setOwnerEmail(request.getOwnerEmail());
        session.setMessage(request.getMessage());
        session.setDueDate(request.getDueDate());
        session.setOriginalPdf(request.getFileInput().getBytes());

        for (int i = 0; i < request.getParticipantEmails().size(); i++) {
            SigningParticipant participant = new SigningParticipant();
            participant.setEmail(request.getParticipantEmails().get(i));
            if (request.getParticipantNames() != null
                    && request.getParticipantNames().size() > i
                    && StringUtils.isNotBlank(request.getParticipantNames().get(i))) {
                participant.setName(request.getParticipantNames().get(i));
            }
            session.getParticipants().add(participant);
        }

        if (Boolean.TRUE.equals(request.getNotifyOnCreate())) {
            broadcastNotification(
                    session,
                    request.getMessage() != null
                            ? request.getMessage()
                            : "You have been invited to sign a document.");
        }

        sessions.put(session.getSessionId(), session);
        return session;
    }

    public SigningSession getSession(String sessionId) {
        SigningSession session = sessions.get(sessionId);
        if (session == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.notFound", "Signing session {0} was not found", sessionId);
        }
        return session;
    }

    @Override
    public SigningSession notifyParticipants(String sessionId, Object requestObj) {
        NotifySigningParticipantsRequest request = (NotifySigningParticipantsRequest) requestObj;
        SigningSession session = getSession(sessionId);
        List<SigningParticipant> targets = getTargets(session, request.getParticipantEmails());
        String message =
                StringUtils.defaultIfBlank(
                        request.getMessage(), "A reminder to review and sign the document.");

        for (SigningParticipant participant : targets) {
            participant.recordNotification(message);
            if (participant.getStatus() == ParticipantStatus.PENDING) {
                participant.setStatus(ParticipantStatus.NOTIFIED);
            }
        }
        session.touch();
        return session;
    }

    @Override
    public SigningSession attachCertificate(
            String sessionId, String participantEmail, Object requestObj) throws IOException {
        ParticipantCertificateRequest request = (ParticipantCertificateRequest) requestObj;
        SigningSession session = getSession(sessionId);
        SigningParticipant participant =
                session.getParticipants().stream()
                        .filter(p -> participantEmail.equalsIgnoreCase(p.getEmail()))
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.notFound",
                                                "Participant {0} does not exist",
                                                participantEmail));

        participant.setCertificateSubmission(toSubmission(request));
        participant.setStatus(ParticipantStatus.SIGNED);
        session.touch();
        return session;
    }

    private void broadcastNotification(SigningSession session, String message) {
        for (SigningParticipant participant : session.getParticipants()) {
            participant.recordNotification(message);
            if (participant.getStatus() == ParticipantStatus.PENDING) {
                participant.setStatus(ParticipantStatus.NOTIFIED);
            }
        }
        session.touch();
    }

    private ParticipantCertificateSubmission toSubmission(ParticipantCertificateRequest request)
            throws IOException {
        return ParticipantCertificateSubmission.builder()
                .certType(request.getCertType())
                .password(request.getPassword())
                .privateKey(toBytes(request.getPrivateKeyFile()))
                .certificate(toBytes(request.getCertFile()))
                .p12Keystore(toBytes(request.getP12File()))
                .jksKeystore(toBytes(request.getJksFile()))
                .showSignature(request.getShowSignature())
                .pageNumber(request.getPageNumber())
                .name(request.getName())
                .reason(request.getReason())
                .location(request.getLocation())
                .showLogo(request.getShowLogo())
                .build();
    }

    private byte[] toBytes(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            return null;
        }
        return file.getBytes();
    }

    private List<SigningParticipant> getTargets(
            SigningSession session, List<String> requestedEmails) {
        if (requestedEmails == null || requestedEmails.isEmpty()) {
            return session.getParticipants();
        }

        List<SigningParticipant> participants = new ArrayList<>();
        for (String email : requestedEmails) {
            Optional<SigningParticipant> participant =
                    session.getParticipants().stream()
                            .filter(p -> Objects.equals(p.getEmail(), email))
                            .findFirst();
            participant.ifPresent(participants::add);
        }
        return participants;
    }

    // Interface methods that are not supported by in-memory implementation
    @Override
    public List<?> listUserSessions(String username) {
        // In-memory implementation doesn't support user filtering
        return Collections.emptyList();
    }

    @Override
    public Object getSessionDetail(String sessionId, String username) {
        // In-memory implementation doesn't have separate detail view
        return getSession(sessionId);
    }

    @Override
    public void deleteSession(String sessionId, String username) {
        // In-memory implementation doesn't support deletion
        throw new UnsupportedOperationException(
                "Session deletion not supported in non-database mode");
    }

    @Override
    public Object addParticipants(String sessionId, Object request, String username) {
        // In-memory implementation doesn't support adding participants
        throw new UnsupportedOperationException(
                "Adding participants not supported in non-database mode");
    }

    @Override
    public void removeParticipant(String sessionId, String participantEmail, String username) {
        // In-memory implementation doesn't support removing participants
        throw new UnsupportedOperationException(
                "Removing participants not supported in non-database mode");
    }

    @Override
    public void markSessionFinalized(String sessionId, byte[] signedPdf) {
        SigningSession session = getSession(sessionId);
        session.setSignedPdf(signedPdf);
    }

    @Override
    public byte[] getSessionPdf(String sessionId, String token) {
        SigningSession session = getSession(sessionId);
        // Validate token
        boolean validToken =
                session.getParticipants().stream().anyMatch(p -> p.getShareToken().equals(token));
        if (!validToken) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.unauthorized", "Invalid token for session", sessionId);
        }
        return session.getOriginalPdf();
    }

    @Override
    public byte[] getSignedPdf(String sessionId, String username) {
        throw new UnsupportedOperationException(
                "getSignedPdf is only available in database-backed mode");
    }

    @Override
    public boolean isDatabaseBacked() {
        return false;
    }
}
