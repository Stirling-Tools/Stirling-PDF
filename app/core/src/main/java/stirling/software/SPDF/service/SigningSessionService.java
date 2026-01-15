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
        // In-memory implementation not supported for user-based signing (requires database)
        throw new UnsupportedOperationException(
                "User-based signing requires database-backed implementation");
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
    public SigningSession attachCertificate(String sessionId, Long userId, Object requestObj)
            throws IOException {
        // In-memory implementation doesn't support user-based participants
        throw new UnsupportedOperationException(
                "User-based signing not supported in non-database mode");
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
    public void removeParticipant(String sessionId, Long userId, String username) {
        // In-memory implementation doesn't support user-based participants
        throw new UnsupportedOperationException(
                "User-based signing not supported in non-database mode");
    }

    @Override
    public void markSessionFinalized(String sessionId, byte[] signedPdf) {
        SigningSession session = getSession(sessionId);
        session.setSignedPdf(signedPdf);
    }

    @Override
    public byte[] getSessionPdf(String sessionId, String username) {
        // In-memory implementation doesn't support user authentication
        throw new UnsupportedOperationException(
                "User-based signing not supported in non-database mode");
    }

    @Override
    public byte[] getSignedPdf(String sessionId, String username) {
        throw new UnsupportedOperationException(
                "getSignedPdf is only available in database-backed mode");
    }

    @Override
    public List<?> listSignRequests(String username) {
        // In-memory implementation doesn't support user-based sign requests
        return Collections.emptyList();
    }

    @Override
    public Object getSignRequestDetail(String sessionId, String username) {
        // In-memory implementation doesn't support user-based signing
        throw new UnsupportedOperationException(
                "User-based signing not supported in non-database mode");
    }

    @Override
    public void declineSignRequest(String sessionId, String username) {
        // In-memory implementation doesn't support user-based signing
        throw new UnsupportedOperationException(
                "User-based signing not supported in non-database mode");
    }

    @Override
    public boolean isDatabaseBacked() {
        return false;
    }
}
