package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.util.List;
import java.util.stream.Collectors;

import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.security.*;
import stirling.software.common.service.SigningSessionServiceInterface;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.proprietary.model.ParticipantCertificateSubmissionEntity;
import stirling.software.proprietary.model.SigningParticipantEntity;
import stirling.software.proprietary.model.SigningSessionEntity;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.SigningParticipantRepository;
import stirling.software.proprietary.security.repository.SigningSessionRepository;

@Service
@Slf4j
@RequiredArgsConstructor
public class DatabaseSigningSessionService implements SigningSessionServiceInterface {

    private final SigningSessionRepository sessionRepository;
    private final SigningParticipantRepository participantRepository;
    private final UserService userService;

    @Override
    @Transactional
    public SigningSessionDetailDTO createSession(Object requestObj, String username)
            throws IOException {
        CreateSigningSessionRequest request = (CreateSigningSessionRequest) requestObj;
        if (request.getParticipantEmails() == null || request.getParticipantEmails().isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.optionsNotSpecified",
                    "{0} options are not specified",
                    "participant emails");
        }

        User user =
                userService
                        .findByUsernameIgnoreCase(username)
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.notFound", "User {0} not found", username));

        byte[] pdfBytes = request.getFileInput().getBytes();
        log.info(
                "Creating session with PDF: {} bytes from file {}",
                pdfBytes != null ? pdfBytes.length : 0,
                request.getFileInput().getOriginalFilename());

        if (pdfBytes == null || pdfBytes.length == 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument", "Uploaded PDF is null or empty");
        }

        SigningSessionEntity session = new SigningSessionEntity();
        session.setUser(user);
        session.setDocumentName(request.getFileInput().getOriginalFilename());
        session.setOwnerEmail(request.getOwnerEmail());
        session.setMessage(request.getMessage());
        session.setDueDate(request.getDueDate());
        session.setOriginalPdf(pdfBytes);

        for (int i = 0; i < request.getParticipantEmails().size(); i++) {
            SigningParticipantEntity participant = new SigningParticipantEntity();
            participant.setEmail(request.getParticipantEmails().get(i));
            if (request.getParticipantNames() != null
                    && request.getParticipantNames().size() > i
                    && StringUtils.isNotBlank(request.getParticipantNames().get(i))) {
                participant.setName(request.getParticipantNames().get(i));
            }
            session.addParticipant(participant);
        }

        if (Boolean.TRUE.equals(request.getNotifyOnCreate())) {
            for (SigningParticipantEntity participant : session.getParticipants()) {
                participant.recordNotification(
                        request.getMessage() != null
                                ? request.getMessage()
                                : "You have been invited to sign a document.");
                if (participant.getStatus() == ParticipantStatus.PENDING) {
                    participant.setStatus(ParticipantStatus.NOTIFIED);
                }
            }
        }

        session = sessionRepository.save(session);
        return toDetailDTO(session);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SigningSessionSummaryDTO> listUserSessions(String username) {
        User user =
                userService
                        .findByUsernameIgnoreCase(username)
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.notFound", "User {0} not found", username));

        List<SigningSessionEntity> sessions =
                sessionRepository.findAllByUserIdOrderByCreatedAtDesc(user.getId());
        return sessions.stream().map(this::toSummaryDTO).collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public SigningSessionDetailDTO getSessionDetail(String sessionId, String username) {
        SigningSessionEntity session = getSessionEntityByIdWithOwnershipCheck(sessionId, username);
        return toDetailDTO(session);
    }

    @Transactional(readOnly = true)
    public SigningSession getSession(String sessionId) {
        // Use query with participants and certificates fetch for finalization
        SigningSessionEntity entity =
                sessionRepository
                        .findBySessionIdWithParticipantsAndCertificates(sessionId)
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.notFound",
                                                "Signing session {0} was not found",
                                                sessionId));

        // Force LOB loading within transaction
        byte[] originalPdf = entity.getOriginalPdf();
        byte[] signedPdf = entity.getSignedPdf();

        log.debug(
                "Loading session {} for signing: originalPdf={} bytes, signedPdf={} bytes, participants={}",
                sessionId,
                originalPdf != null ? originalPdf.length : 0,
                signedPdf != null ? signedPdf.length : 0,
                entity.getParticipants().size());

        if (originalPdf == null || originalPdf.length == 0) {
            log.error("Original PDF is null or empty for session {}", sessionId);
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.notFound", "Original PDF not found for session {0}", sessionId);
        }

        return toSigningSession(entity);
    }

    public SigningSessionEntity getSessionEntityById(String sessionId) {
        return sessionRepository
                .findBySessionIdWithParticipants(sessionId)
                .orElseThrow(
                        () ->
                                ExceptionUtils.createIllegalArgumentException(
                                        "error.notFound",
                                        "Signing session {0} was not found",
                                        sessionId));
    }

    private SigningSessionEntity getSessionEntityByIdWithOwnershipCheck(
            String sessionId, String username) {
        SigningSessionEntity session = getSessionEntityById(sessionId);
        validateSessionOwnership(session, username);
        return session;
    }

    @Override
    @Transactional
    public void deleteSession(String sessionId, String username) {
        SigningSessionEntity session = getSessionEntityByIdWithOwnershipCheck(sessionId, username);
        if (session.isFinalized()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument", "Cannot delete finalized session", sessionId);
        }
        sessionRepository.delete(session);
    }

    @Override
    @Transactional
    public SigningSessionDetailDTO addParticipants(
            String sessionId, Object requestObj, String username) {
        AddParticipantsRequest request = (AddParticipantsRequest) requestObj;
        if (request.getParticipantEmails() == null || request.getParticipantEmails().isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.optionsNotSpecified",
                    "{0} options are not specified",
                    "participant emails");
        }

        SigningSessionEntity session = getSessionEntityByIdWithOwnershipCheck(sessionId, username);

        for (int i = 0; i < request.getParticipantEmails().size(); i++) {
            SigningParticipantEntity participant = new SigningParticipantEntity();
            participant.setEmail(request.getParticipantEmails().get(i));
            if (request.getParticipantNames() != null
                    && request.getParticipantNames().size() > i
                    && StringUtils.isNotBlank(request.getParticipantNames().get(i))) {
                participant.setName(request.getParticipantNames().get(i));
            }
            session.addParticipant(participant);
        }

        session = sessionRepository.save(session);
        return toDetailDTO(session);
    }

    @Override
    @Transactional
    public void removeParticipant(String sessionId, String participantEmail, String username) {
        SigningSessionEntity session = getSessionEntityByIdWithOwnershipCheck(sessionId, username);

        SigningParticipantEntity participant =
                session.getParticipants().stream()
                        .filter(p -> participantEmail.equalsIgnoreCase(p.getEmail()))
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.notFound",
                                                "Participant {0} not found",
                                                participantEmail));

        if (participant.getStatus() == ParticipantStatus.SIGNED) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Cannot remove participant who has already signed",
                    participantEmail);
        }

        session.removeParticipant(participant);
        sessionRepository.save(session);
    }

    @Override
    @Transactional
    public SigningSession notifyParticipants(String sessionId, Object requestObj) {
        NotifySigningParticipantsRequest request = (NotifySigningParticipantsRequest) requestObj;
        SigningSessionEntity session = getSessionEntityById(sessionId);
        List<SigningParticipantEntity> targets =
                getTargetParticipants(session, request.getParticipantEmails());
        String message =
                StringUtils.defaultIfBlank(
                        request.getMessage(), "A reminder to review and sign the document.");

        for (SigningParticipantEntity participant : targets) {
            participant.recordNotification(message);
            if (participant.getStatus() == ParticipantStatus.PENDING) {
                participant.setStatus(ParticipantStatus.NOTIFIED);
            }
        }

        session.touch();
        session = sessionRepository.save(session);
        return toSigningSession(session);
    }

    @Override
    @Transactional
    public SigningSession attachCertificate(
            String sessionId, String participantEmail, Object requestObj) throws IOException {
        ParticipantCertificateRequest request = (ParticipantCertificateRequest) requestObj;
        SigningSessionEntity session = getSessionEntityById(sessionId);
        SigningParticipantEntity participant =
                session.getParticipants().stream()
                        .filter(p -> participantEmail.equalsIgnoreCase(p.getEmail()))
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.notFound",
                                                "Participant {0} does not exist",
                                                participantEmail));

        ParticipantCertificateSubmissionEntity submissionEntity =
                toSubmissionEntity(request, participant);
        participant.setCertificateSubmission(submissionEntity);
        participant.setStatus(ParticipantStatus.SIGNED);

        session.touch();
        session = sessionRepository.save(session);
        return toSigningSession(session);
    }

    @Override
    @Transactional
    public void markSessionFinalized(String sessionId, byte[] signedPdf) {
        if (signedPdf == null || signedPdf.length == 0) {
            log.error("Attempting to save null or empty signed PDF for session {}", sessionId);
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument", "Signed PDF cannot be null or empty", sessionId);
        }

        SigningSessionEntity session =
                sessionRepository
                        .findBySessionId(sessionId)
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.notFound",
                                                "Signing session {0} was not found",
                                                sessionId));

        log.info(
                "Saving signed PDF for session {}: {} bytes",
                sessionId,
                signedPdf != null ? signedPdf.length : 0);
        session.setSignedPdf(signedPdf);
        session.setFinalized(true);
        sessionRepository.saveAndFlush(session);
        log.info("Signed PDF saved successfully for session {}", sessionId);
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] getSessionPdf(String sessionId, String token) {
        SigningSessionEntity session = getSessionEntityById(sessionId);

        // Validate token belongs to a participant in this session
        boolean validToken =
                session.getParticipants().stream().anyMatch(p -> p.getShareToken().equals(token));

        if (!validToken) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.unauthorized", "Invalid token for session", sessionId);
        }

        return session.getOriginalPdf();
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] getSignedPdf(String sessionId, String username) {
        // Use simple query to fetch session without joins for better LOB loading
        SigningSessionEntity session =
                sessionRepository
                        .findBySessionId(sessionId)
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.notFound",
                                                "Signing session {0} was not found",
                                                sessionId));

        validateSessionOwnership(session, username);

        if (!session.isFinalized()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidState", "Session is not finalized", sessionId);
        }

        byte[] signedPdf = session.getSignedPdf();
        if (signedPdf == null || signedPdf.length == 0) {
            log.error("Signed PDF is null or empty for session {}", sessionId);
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.notFound", "Signed PDF not found for session {0}", sessionId);
        }

        return signedPdf;
    }

    private void validateSessionOwnership(SigningSessionEntity session, String username) {
        if (!session.getUser().getUsername().equalsIgnoreCase(username)) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.unauthorized", "You do not have permission to access this session");
        }
    }

    private List<SigningParticipantEntity> getTargetParticipants(
            SigningSessionEntity session, List<String> requestedEmails) {
        if (requestedEmails == null || requestedEmails.isEmpty()) {
            return session.getParticipants();
        }

        return session.getParticipants().stream()
                .filter(p -> requestedEmails.contains(p.getEmail()))
                .collect(Collectors.toList());
    }

    private ParticipantCertificateSubmissionEntity toSubmissionEntity(
            ParticipantCertificateRequest request, SigningParticipantEntity participant)
            throws IOException {
        ParticipantCertificateSubmissionEntity entity =
                new ParticipantCertificateSubmissionEntity();
        entity.setParticipant(participant);
        entity.setCertType(request.getCertType());
        entity.setPassword(request.getPassword());
        entity.setPrivateKey(toBytes(request.getPrivateKeyFile()));
        entity.setCertificate(toBytes(request.getCertFile()));
        entity.setP12Keystore(toBytes(request.getP12File()));
        entity.setJksKeystore(toBytes(request.getJksFile()));
        entity.setShowSignature(request.getShowSignature());
        entity.setPageNumber(request.getPageNumber());
        entity.setName(request.getName());
        entity.setReason(request.getReason());
        entity.setLocation(request.getLocation());
        entity.setShowLogo(request.getShowLogo());
        return entity;
    }

    private byte[] toBytes(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            return null;
        }
        return file.getBytes();
    }

    private SigningSessionSummaryDTO toSummaryDTO(SigningSessionEntity entity) {
        int participantCount = entity.getParticipants().size();
        int signedCount =
                (int)
                        entity.getParticipants().stream()
                                .filter(p -> p.getStatus() == ParticipantStatus.SIGNED)
                                .count();

        return new SigningSessionSummaryDTO(
                entity.getSessionId(),
                entity.getDocumentName(),
                entity.getCreatedAt(),
                participantCount,
                signedCount,
                entity.isFinalized());
    }

    private SigningSessionDetailDTO toDetailDTO(SigningSessionEntity entity) {
        List<ParticipantDTO> participants =
                entity.getParticipants().stream()
                        .map(this::toParticipantDTO)
                        .collect(Collectors.toList());

        return new SigningSessionDetailDTO(
                entity.getSessionId(),
                entity.getDocumentName(),
                entity.getOwnerEmail(),
                entity.getMessage(),
                entity.getDueDate(),
                entity.getCreatedAt(),
                entity.getUpdatedAt(),
                entity.isFinalized(),
                participants);
    }

    private ParticipantDTO toParticipantDTO(SigningParticipantEntity entity) {
        String baseUrl = ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
        String participantUrl =
                baseUrl
                        + "/signing-session?sessionId="
                        + entity.getSession().getSessionId()
                        + "&token="
                        + entity.getShareToken();

        return new ParticipantDTO(
                entity.getEmail(),
                entity.getName(),
                entity.getStatus(),
                entity.getShareToken(),
                entity.getLastUpdated(),
                participantUrl);
    }

    private SigningSession toSigningSession(SigningSessionEntity entity) {
        SigningSession session = new SigningSession();
        session.setSessionId(entity.getSessionId());
        session.setDocumentName(entity.getDocumentName());
        session.setOriginalPdf(entity.getOriginalPdf());
        session.setSignedPdf(entity.getSignedPdf());
        session.setOwnerEmail(entity.getOwnerEmail());
        session.setMessage(entity.getMessage());
        session.setDueDate(entity.getDueDate());
        session.setCreatedAt(entity.getCreatedAt().toString());
        session.setUpdatedAt(entity.getUpdatedAt().toString());

        List<SigningParticipant> participants =
                entity.getParticipants().stream()
                        .map(this::toSigningParticipant)
                        .collect(Collectors.toList());
        session.setParticipants(participants);

        return session;
    }

    private SigningParticipant toSigningParticipant(SigningParticipantEntity entity) {
        SigningParticipant participant = new SigningParticipant();
        participant.setEmail(entity.getEmail());
        participant.setName(entity.getName());
        participant.setStatus(entity.getStatus());
        participant.setShareToken(entity.getShareToken());
        participant.setNotifications(entity.getNotifications());
        participant.setLastUpdated(entity.getLastUpdated().toString());

        if (entity.getCertificateSubmission() != null) {
            participant.setCertificateSubmission(
                    toParticipantCertificateSubmission(entity.getCertificateSubmission()));
        }

        return participant;
    }

    private ParticipantCertificateSubmission toParticipantCertificateSubmission(
            ParticipantCertificateSubmissionEntity entity) {
        return ParticipantCertificateSubmission.builder()
                .certType(entity.getCertType())
                .password(entity.getPassword())
                .privateKey(entity.getPrivateKey())
                .certificate(entity.getCertificate())
                .p12Keystore(entity.getP12Keystore())
                .jksKeystore(entity.getJksKeystore())
                .showSignature(entity.getShowSignature())
                .pageNumber(entity.getPageNumber())
                .name(entity.getName())
                .reason(entity.getReason())
                .location(entity.getLocation())
                .showLogo(entity.getShowLogo())
                .build();
    }

    @Override
    public boolean isDatabaseBacked() {
        return true;
    }
}
