package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.security.*;
import stirling.software.common.service.SigningSessionServiceInterface;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.proprietary.model.ParticipantCertificateSubmissionEntity;
import stirling.software.proprietary.model.SigningParticipantEntity;
import stirling.software.proprietary.model.SigningSessionEntity;
import stirling.software.proprietary.security.database.repository.UserRepository;
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
    private final UserRepository userRepository;

    @Override
    @Transactional
    public SigningSessionDetailDTO createSession(Object requestObj, String username)
            throws IOException {
        CreateSigningSessionRequest request = (CreateSigningSessionRequest) requestObj;
        if (request.getParticipantUserIds() == null || request.getParticipantUserIds().isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.optionsNotSpecified",
                    "{0} options are not specified",
                    "participant user IDs");
        }

        User owner =
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
        session.setUser(owner);
        session.setDocumentName(request.getFileInput().getOriginalFilename());
        session.setOwnerEmail(request.getOwnerEmail());
        session.setMessage(request.getMessage());
        session.setDueDate(request.getDueDate());
        session.setOriginalPdf(pdfBytes);

        // Add participants by user ID
        for (Long userId : request.getParticipantUserIds()) {
            User participantUser =
                    userRepository
                            .findById(userId)
                            .orElseThrow(
                                    () ->
                                            ExceptionUtils.createIllegalArgumentException(
                                                    "error.notFound",
                                                    "User ID {0} not found",
                                                    userId));

            SigningParticipantEntity participant = new SigningParticipantEntity();
            participant.setUser(participantUser);
            participant.setEmail(participantUser.getUsername()); // Keep for audit trail
            participant.setName(participantUser.getUsername());

            // Apply owner's signature appearance settings
            participant.setShowSignature(request.getShowSignature());
            participant.setPageNumber(request.getPageNumber());
            participant.setReason(request.getReason());
            participant.setLocation(request.getLocation());
            participant.setShowLogo(request.getShowLogo());

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
        if (request.getParticipantUserIds() == null || request.getParticipantUserIds().isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.optionsNotSpecified",
                    "{0} options are not specified",
                    "participant user IDs");
        }

        SigningSessionEntity session = getSessionEntityByIdWithOwnershipCheck(sessionId, username);

        // Add participants by user ID
        for (Long userId : request.getParticipantUserIds()) {
            User participantUser =
                    userRepository
                            .findById(userId)
                            .orElseThrow(
                                    () ->
                                            ExceptionUtils.createIllegalArgumentException(
                                                    "error.notFound",
                                                    "User ID {0} not found",
                                                    userId));

            SigningParticipantEntity participant = new SigningParticipantEntity();
            participant.setUser(participantUser);
            participant.setEmail(participantUser.getUsername()); // Keep for audit trail
            participant.setName(participantUser.getUsername());

            // Copy signature settings from existing participants (or use defaults)
            SigningParticipantEntity firstParticipant =
                    session.getParticipants().isEmpty() ? null : session.getParticipants().get(0);
            if (firstParticipant != null) {
                participant.setShowSignature(firstParticipant.getShowSignature());
                participant.setPageNumber(firstParticipant.getPageNumber());
                participant.setReason(firstParticipant.getReason());
                participant.setLocation(firstParticipant.getLocation());
                participant.setShowLogo(firstParticipant.getShowLogo());
            }

            session.addParticipant(participant);
        }

        session = sessionRepository.save(session);
        return toDetailDTO(session);
    }

    @Override
    @Transactional
    public void removeParticipant(String sessionId, Long userId, String username) {
        SigningSessionEntity session = getSessionEntityByIdWithOwnershipCheck(sessionId, username);

        SigningParticipantEntity participant =
                session.getParticipants().stream()
                        .filter(p -> p.getUser().getId().equals(userId))
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.notFound",
                                                "Participant with user ID {0} not found",
                                                userId));

        if (participant.getStatus() == ParticipantStatus.SIGNED) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Cannot remove participant who has already signed",
                    userId);
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
    public SigningSession attachCertificate(String sessionId, Long userId, Object requestObj)
            throws IOException {
        ParticipantCertificateRequest request = (ParticipantCertificateRequest) requestObj;
        SigningSessionEntity session = getSessionEntityById(sessionId);
        SigningParticipantEntity participant =
                session.getParticipants().stream()
                        .filter(p -> p.getUser().getId().equals(userId))
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.notFound",
                                                "Participant with user ID {0} does not exist",
                                                userId));

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
    public byte[] getSessionPdf(String sessionId, String username) {
        SigningSessionEntity session = getSessionEntityById(sessionId);

        // Validate user is a participant in this session
        boolean isParticipant =
                session.getParticipants().stream()
                        .anyMatch(p -> p.getUser().getUsername().equalsIgnoreCase(username));

        if (!isParticipant) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.unauthorized",
                    "User {0} is not a participant in session {1}",
                    username,
                    sessionId);
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

    @Override
    @Transactional(readOnly = true)
    public List<SignRequestSummaryDTO> listSignRequests(String username) {
        User user =
                userService
                        .findByUsernameIgnoreCase(username)
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.notFound", "User {0} not found", username));

        // Find all sessions where user is a participant
        List<SigningSessionEntity> sessions =
                sessionRepository.findAll().stream()
                        .filter(
                                session ->
                                        session.getParticipants().stream()
                                                .anyMatch(
                                                        p ->
                                                                p.getUser()
                                                                        .getId()
                                                                        .equals(user.getId())))
                        .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                        .collect(Collectors.toList());

        return sessions.stream()
                .map(session -> toSignRequestSummaryDTO(session, user.getId()))
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public SignRequestDetailDTO getSignRequestDetail(String sessionId, String username) {
        SigningSessionEntity session = getSessionEntityById(sessionId);

        User user =
                userService
                        .findByUsernameIgnoreCase(username)
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.notFound", "User {0} not found", username));

        // Find participant matching user
        SigningParticipantEntity participant =
                session.getParticipants().stream()
                        .filter(p -> p.getUser().getId().equals(user.getId()))
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.unauthorized",
                                                "User {0} is not a participant in session {1}",
                                                username,
                                                sessionId));

        String ownerUsername =
                session.getUser() != null
                        ? session.getUser().getUsername()
                        : session.getOwnerEmail();

        return new SignRequestDetailDTO(
                session.getSessionId(),
                session.getDocumentName(),
                ownerUsername,
                session.getMessage(),
                session.getDueDate(),
                session.getCreatedAt().toString(),
                participant.getStatus(),
                participant.getShowSignature(),
                participant.getPageNumber(),
                participant.getReason(),
                participant.getLocation(),
                participant.getShowLogo());
    }

    @Override
    @Transactional
    public void declineSignRequest(String sessionId, String username) {
        SigningSessionEntity session = getSessionEntityById(sessionId);

        User user =
                userService
                        .findByUsernameIgnoreCase(username)
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.notFound", "User {0} not found", username));

        // Find participant matching user
        SigningParticipantEntity participant =
                session.getParticipants().stream()
                        .filter(p -> p.getUser().getId().equals(user.getId()))
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.unauthorized",
                                                "User {0} is not a participant in session {1}",
                                                username,
                                                sessionId));

        if (participant.getStatus() == ParticipantStatus.SIGNED) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidState",
                    "Cannot decline - participant has already signed",
                    sessionId);
        }

        participant.setStatus(ParticipantStatus.DECLINED);
        session.touch();
        sessionRepository.save(session);
    }

    @Override
    @Transactional
    public void signDocument(String sessionId, String username, Object request) throws IOException {
        if (!(request instanceof SignDocumentRequest)) {
            throw new IllegalArgumentException("Invalid request type");
        }

        SignDocumentRequest signRequest = (SignDocumentRequest) request;
        SigningSessionEntity session = getSessionEntityById(sessionId);

        User user =
                userService
                        .findByUsernameIgnoreCase(username)
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.notFound", "User {0} not found", username));

        // Find participant matching user
        SigningParticipantEntity participant =
                session.getParticipants().stream()
                        .filter(p -> p.getUser().getId().equals(user.getId()))
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        ExceptionUtils.createIllegalArgumentException(
                                                "error.unauthorized",
                                                "User {0} is not a participant in session {1}",
                                                username,
                                                sessionId));

        if (participant.getStatus() == ParticipantStatus.SIGNED) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidState", "Participant has already signed", sessionId);
        }

        if (participant.getStatus() == ParticipantStatus.DECLINED) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidState", "Cannot sign - participant has declined", sessionId);
        }

        // Store wet signature metadata if provided
        if (signRequest.hasWetSignature()) {
            WetSignatureMetadata wetSig = signRequest.extractWetSignatureMetadata();
            participant.setWetSignatureType(wetSig.getType());
            participant.setWetSignatureData(wetSig.getData());
            participant.setWetSignaturePage(wetSig.getPage());
            participant.setWetSignatureX(wetSig.getX());
            participant.setWetSignatureY(wetSig.getY());
            participant.setWetSignatureWidth(wetSig.getWidth());
            participant.setWetSignatureHeight(wetSig.getHeight());
        }

        // Store certificate data (reuse existing attachCertificate logic)
        ParticipantCertificateRequest certRequest = new ParticipantCertificateRequest();
        certRequest.setCertType(signRequest.getCertType());
        certRequest.setPassword(signRequest.getPassword());
        certRequest.setP12File(signRequest.getP12File());
        certRequest.setPrivateKeyFile(signRequest.getPrivateKeyFile());
        certRequest.setCertFile(signRequest.getCertFile());

        // Use participant's signature settings from session
        certRequest.setShowSignature(participant.getShowSignature());
        certRequest.setPageNumber(participant.getPageNumber());
        certRequest.setReason(participant.getReason());
        certRequest.setLocation(participant.getLocation());
        certRequest.setShowLogo(participant.getShowLogo());

        // Store certificate submission (same as attachCertificate method)
        ParticipantCertificateSubmissionEntity submissionEntity =
                toSubmissionEntity(certRequest, participant);
        participant.setCertificateSubmission(submissionEntity);

        // Mark as signed
        participant.setStatus(ParticipantStatus.SIGNED);
        session.touch();
        sessionRepository.save(session);
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
        // Copy signature appearance settings from participant (configured by owner)
        entity.setShowSignature(participant.getShowSignature());
        entity.setPageNumber(participant.getPageNumber());
        entity.setName(participant.getName());
        entity.setReason(participant.getReason());
        entity.setLocation(participant.getLocation());
        entity.setShowLogo(participant.getShowLogo());
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

    private SignRequestSummaryDTO toSignRequestSummaryDTO(
            SigningSessionEntity entity, Long userId) {
        // Find participant matching user to get their status
        SigningParticipantEntity participant =
                entity.getParticipants().stream()
                        .filter(p -> p.getUser().getId().equals(userId))
                        .findFirst()
                        .orElse(null);

        ParticipantStatus myStatus =
                participant != null ? participant.getStatus() : ParticipantStatus.PENDING;

        String ownerUsername =
                entity.getUser() != null ? entity.getUser().getUsername() : entity.getOwnerEmail();

        return new SignRequestSummaryDTO(
                entity.getSessionId(),
                entity.getDocumentName(),
                ownerUsername,
                entity.getCreatedAt().toString(),
                entity.getDueDate(),
                myStatus);
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
        User user = entity.getUser();
        return new ParticipantDTO(
                user.getId(),
                user.getUsername(),
                entity.getName() != null ? entity.getName() : user.getUsername(),
                entity.getStatus(),
                entity.getLastUpdated(),
                entity.getShowSignature(),
                entity.getPageNumber(),
                entity.getReason(),
                entity.getLocation(),
                entity.getShowLogo());
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
        // Force lazy collection to load by creating a new ArrayList
        participant.setNotifications(new ArrayList<>(entity.getNotifications()));
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

    /**
     * Gets all wet signature metadata for participants who have signed. Used during finalization to
     * overlay wet signatures on the PDF.
     *
     * @param sessionId The session ID
     * @return List of wet signature metadata for all signed participants
     */
    public List<WetSignatureMetadata> getAllWetSignatures(String sessionId) {
        SigningSessionEntity session = getSessionEntityById(sessionId);

        return session.getParticipants().stream()
                .filter(p -> p.getStatus() == ParticipantStatus.SIGNED)
                .filter(p -> p.getWetSignatureType() != null)
                .map(
                        p -> {
                            WetSignatureMetadata meta = new WetSignatureMetadata();
                            meta.setType(p.getWetSignatureType());
                            meta.setData(p.getWetSignatureData());
                            meta.setPage(p.getWetSignaturePage());
                            meta.setX(p.getWetSignatureX());
                            meta.setY(p.getWetSignatureY());
                            meta.setWidth(p.getWetSignatureWidth());
                            meta.setHeight(p.getWetSignatureHeight());
                            return meta;
                        })
                .collect(Collectors.toList());
    }

    /**
     * Clears wet signature metadata from all participants after finalization. This is required for
     * GDPR compliance and to avoid storing large base64 data.
     *
     * @param sessionId The session ID
     */
    @Transactional
    public void clearWetSignatureMetadata(String sessionId) {
        SigningSessionEntity session = getSessionEntityById(sessionId);

        boolean anyCleared = false;
        for (SigningParticipantEntity participant : session.getParticipants()) {
            if (participant.getWetSignatureType() != null) {
                participant.setWetSignatureType(null);
                participant.setWetSignatureData(null);
                participant.setWetSignaturePage(null);
                participant.setWetSignatureX(null);
                participant.setWetSignatureY(null);
                participant.setWetSignatureWidth(null);
                participant.setWetSignatureHeight(null);
                anyCleared = true;
            }
        }

        if (anyCleared) {
            log.info("Cleared wet signature metadata for session: {}", sessionId);
            sessionRepository.save(session);
        }
    }

    @Override
    public boolean isDatabaseBacked() {
        return true;
    }
}
