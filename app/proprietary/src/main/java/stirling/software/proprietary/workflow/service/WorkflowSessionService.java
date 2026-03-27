package stirling.software.proprietary.workflow.service;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FilePurpose;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.workflow.dto.ParticipantRequest;
import stirling.software.proprietary.workflow.dto.WetSignatureMetadata;
import stirling.software.proprietary.workflow.dto.WorkflowCreationRequest;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowStatus;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.repository.WorkflowSessionRepository;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * Core service for workflow session management. Handles creation, participant management, and
 * lifecycle coordination.
 *
 * <p>Delegates file storage to FileStorageService/StorageProvider and integrates with the file
 * sharing infrastructure.
 */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class WorkflowSessionService {

    private final WorkflowSessionRepository workflowSessionRepository;
    private final WorkflowParticipantRepository workflowParticipantRepository;
    private final StoredFileRepository storedFileRepository;
    private final UserRepository userRepository;
    private final StorageProvider storageProvider;
    private final ObjectMapper objectMapper;
    private final ApplicationProperties applicationProperties;
    private final MetadataEncryptionService metadataEncryptionService;
    private final CertificateSubmissionValidator certificateSubmissionValidator;

    public void ensureSigningEnabled() {
        if (!applicationProperties.getStorage().isEnabled()
                || !applicationProperties.getStorage().getSigning().isEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Group signing is disabled");
        }
    }

    /**
     * Creates a new workflow session with participants. Stores the original file using
     * StorageProvider.
     */
    public WorkflowSession createSession(
            User owner, MultipartFile file, WorkflowCreationRequest request) throws IOException {
        log.info(
                "Creating workflow session for user {} with type {}",
                owner.getUsername(),
                request.getWorkflowType());

        // Validate request
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is required");
        }

        if (request.getWorkflowType() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Workflow type is required");
        }

        // Store original file using StorageProvider
        StoredFile originalFile = storeWorkflowFile(owner, file, FilePurpose.SIGNING_ORIGINAL);

        // Create workflow session
        WorkflowSession session = new WorkflowSession();
        session.setSessionId(UUID.randomUUID().toString());
        session.setOwner(owner);
        session.setWorkflowType(request.getWorkflowType());
        session.setDocumentName(
                request.getDocumentName() != null
                        ? request.getDocumentName()
                        : file.getOriginalFilename());
        session.setOriginalFile(originalFile);
        session.setOwnerEmail(request.getOwnerEmail());
        session.setMessage(request.getMessage());
        session.setDueDate(request.getDueDate());
        session.setStatus(WorkflowStatus.IN_PROGRESS);

        // Parse workflow metadata from JSON string to Map
        if (request.getWorkflowMetadata() != null && !request.getWorkflowMetadata().isBlank()) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> metadataMap =
                        objectMapper.readValue(request.getWorkflowMetadata(), Map.class);
                session.setWorkflowMetadata(metadataMap);
            } catch (JacksonException e) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Invalid workflowMetadata: must be a valid JSON object");
            }
        }

        // Link file back to session
        originalFile.setWorkflowSession(session);
        originalFile.setPurpose(FilePurpose.SIGNING_ORIGINAL);

        session = workflowSessionRepository.save(session);
        storedFileRepository.save(originalFile);

        // Add participants
        List<ParticipantRequest> participants = new ArrayList<>();

        if (request.getParticipantUserIds() != null) {
            for (Long userId : request.getParticipantUserIds()) {
                ParticipantRequest pr = new ParticipantRequest();
                pr.setUserId(userId);
                pr.setAccessRole(ShareAccessRole.EDITOR);
                participants.add(pr);
            }
        }

        if (request.getParticipantEmails() != null) {
            for (String email : request.getParticipantEmails()) {
                ParticipantRequest pr = new ParticipantRequest();
                pr.setEmail(email);
                pr.setAccessRole(ShareAccessRole.EDITOR);
                participants.add(pr);
            }
        }

        if (!participants.isEmpty()) {
            addParticipantsToSession(session, participants);
        }

        log.info(
                "Created workflow session {} with {} participants",
                session.getSessionId(),
                session.getParticipants().size());
        return session;
    }

    /** Adds participants to a workflow session. */
    private void addParticipantsToSession(
            WorkflowSession session, List<ParticipantRequest> participantRequests) {
        for (ParticipantRequest request : participantRequests) {
            WorkflowParticipant participant = new WorkflowParticipant();
            participant.setShareToken(UUID.randomUUID().toString());
            participant.setAccessRole(
                    request.getAccessRole() != null
                            ? request.getAccessRole()
                            : ShareAccessRole.EDITOR);
            participant.setExpiresAt(request.getExpiresAt());

            // Parse participant metadata from JSON string to Map
            if (request.getParticipantMetadata() != null
                    && !request.getParticipantMetadata().isBlank()) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> metadataMap =
                            objectMapper.readValue(request.getParticipantMetadata(), Map.class);
                    participant.setParticipantMetadata(metadataMap);
                } catch (JacksonException e) {
                    log.warn(
                            "Failed to parse participant metadata for {}, using empty map",
                            request.getEmail(),
                            e);
                    participant.setParticipantMetadata(new HashMap<>());
                }
            }

            // Store defaultReason in participant metadata if provided
            if (request.getDefaultReason() != null && !request.getDefaultReason().isBlank()) {
                Map<String, Object> metadata = participant.getParticipantMetadata();
                if (metadata == null) {
                    metadata = new HashMap<>();
                }
                metadata.put("defaultReason", request.getDefaultReason());
                participant.setParticipantMetadata(metadata);
                log.debug(
                        "Set default reason for participant {}: {}",
                        request.getEmail(),
                        request.getDefaultReason());
            }

            participant.setStatus(ParticipantStatus.PENDING);

            // Set user or email
            if (request.getUserId() != null) {
                User user =
                        userRepository
                                .findById(request.getUserId())
                                .orElseThrow(
                                        () ->
                                                new ResponseStatusException(
                                                        HttpStatus.NOT_FOUND,
                                                        "User not found: " + request.getUserId()));
                participant.setUser(user);
                participant.setEmail(user.getUsername()); // User entity uses username, not email
                participant.setName(user.getUsername());
            } else if (request.getEmail() != null) {
                participant.setEmail(request.getEmail());
                participant.setName(
                        request.getName() != null ? request.getName() : request.getEmail());
            } else {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Participant must have either userId or email");
            }

            session.addParticipant(participant);
            participant = workflowParticipantRepository.save(participant);
        }
    }

    /** Stores a file as part of a workflow using the StorageProvider. */
    private StoredFile storeWorkflowFile(User owner, MultipartFile file, FilePurpose purpose)
            throws IOException {
        // Store file content (storage provider generates the key)
        StoredObject storedObject = storageProvider.store(owner, file);

        // Create StoredFile entity
        StoredFile storedFile = new StoredFile();
        storedFile.setOwner(owner);
        storedFile.setOriginalFilename(storedObject.getOriginalFilename());
        storedFile.setContentType(storedObject.getContentType());
        storedFile.setSizeBytes(storedObject.getSizeBytes());
        storedFile.setStorageKey(storedObject.getStorageKey());
        storedFile.setPurpose(purpose);

        return storedFileRepository.save(storedFile);
    }

    /** Retrieves a workflow session by session ID. */
    @Transactional(readOnly = true)
    public WorkflowSession getSession(String sessionId) {
        return workflowSessionRepository
                .findBySessionId(sessionId)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND,
                                        "Workflow session not found: " + sessionId));
    }

    /** Retrieves a workflow session with authorization check. */
    @Transactional(readOnly = true)
    public WorkflowSession getSessionForOwner(String sessionId, User owner) {
        WorkflowSession session = getSession(sessionId);
        if (!session.getOwner().equals(owner)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Not authorized to access this workflow session");
        }
        return session;
    }

    /** Retrieves a workflow session with participants eagerly loaded for finalization. */
    @Transactional(readOnly = true)
    public WorkflowSession getSessionWithParticipants(String sessionId) {
        return workflowSessionRepository
                .findBySessionIdWithParticipants(sessionId)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND,
                                        "Workflow session not found: " + sessionId));
    }

    /** Retrieves a workflow session with participants, with authorization check. */
    @Transactional(readOnly = true)
    public WorkflowSession getSessionWithParticipantsForOwner(String sessionId, User owner) {
        WorkflowSession session = getSessionWithParticipants(sessionId);
        if (!session.getOwner().equals(owner)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Not authorized to access this workflow session");
        }
        return session;
    }

    /** Lists all workflow sessions owned by a user. */
    @Transactional(readOnly = true)
    public List<WorkflowSession> listUserSessions(User owner) {
        return workflowSessionRepository.findByOwnerOrderByCreatedAtDesc(owner);
    }

    /** Lists active workflow sessions for a user. */
    @Transactional(readOnly = true)
    public List<WorkflowSession> listActiveSessions(User owner) {
        return workflowSessionRepository.findActiveSessionsByOwner(owner);
    }

    /** Adds additional participants to an existing session. */
    @Transactional
    public void addParticipants(
            String sessionId, List<ParticipantRequest> participants, User owner) {
        WorkflowSession session = getSessionForOwner(sessionId, owner);

        if (!session.isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Cannot add participants to inactive workflow");
        }

        addParticipantsToSession(session, participants);
        log.info("Added {} participants to session {}", participants.size(), sessionId);
    }

    /** Removes a participant from a workflow session. */
    @Transactional
    public void removeParticipant(String sessionId, Long participantId, User owner) {
        WorkflowSession session = getSessionForOwner(sessionId, owner);

        WorkflowParticipant participant =
                workflowParticipantRepository
                        .findById(participantId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "Participant not found: " + participantId));

        if (!participant.getWorkflowSession().equals(session)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Participant not in this workflow session");
        }

        session.removeParticipant(participant);
        workflowParticipantRepository.delete(participant);
        log.info("Removed participant {} from session {}", participantId, sessionId);
    }

    /** Updates participant status (e.g., NOTIFIED, VIEWED, SIGNED). */
    public void updateParticipantStatus(Long participantId, ParticipantStatus newStatus) {
        WorkflowParticipant participant =
                workflowParticipantRepository
                        .findById(participantId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "Participant not found: " + participantId));

        participant.setStatus(newStatus);
        workflowParticipantRepository.save(participant);
        log.debug("Updated participant {} status to {}", participantId, newStatus);
    }

    /** Adds a notification message to a participant's history. */
    public void addParticipantNotification(Long participantId, String message) {
        WorkflowParticipant participant =
                workflowParticipantRepository
                        .findById(participantId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "Participant not found: " + participantId));

        String timestampedMessage = LocalDateTime.now().toString() + ": " + message;
        participant.addNotification(timestampedMessage);
        workflowParticipantRepository.save(participant);
    }

    /** Stores the processed/finalized file for a workflow session. */
    public void storeProcessedFile(WorkflowSession session, byte[] fileData, String filename)
            throws IOException {
        log.info("Storing processed file for session {}", session.getSessionId());

        // Create a temporary multipart file wrapper
        MultipartFile processedFile = new ByteArrayMultipartFile(fileData, filename);

        // Store using StorageProvider
        StoredFile storedFile =
                storeWorkflowFile(session.getOwner(), processedFile, FilePurpose.SIGNING_SIGNED);

        // Link to session
        storedFile.setWorkflowSession(session);
        session.setProcessedFile(storedFile);

        storedFileRepository.save(storedFile);
        workflowSessionRepository.save(session);
    }

    /** Marks a workflow session as finalized. */
    public void finalizeSession(String sessionId, User owner) {
        WorkflowSession session = getSessionForOwner(sessionId, owner);

        if (session.isFinalized()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Workflow session already finalized");
        }

        session.setFinalized(true);
        session.setStatus(WorkflowStatus.COMPLETED);
        workflowSessionRepository.save(session);

        log.info("Finalized workflow session {}", sessionId);
    }

    /** Retrieves the processed file data for a workflow session. */
    @Transactional(readOnly = true)
    public byte[] getProcessedFile(String sessionId, User owner) throws IOException {
        WorkflowSession session = getSessionForOwner(sessionId, owner);

        if (session.getProcessedFile() == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "No processed file available for this session");
        }

        String storageKey = session.getProcessedFile().getStorageKey();
        org.springframework.core.io.Resource resource = storageProvider.load(storageKey);
        return resource.getContentAsByteArray();
    }

    /** Retrieves the original file data for a workflow session. */
    @Transactional(readOnly = true)
    public byte[] getOriginalFile(String sessionId) throws IOException {
        WorkflowSession session = getSession(sessionId);
        if (session.getOriginalFile() == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Original file no longer available (session may be finalized)");
        }
        String storageKey = session.getOriginalFile().getStorageKey();
        org.springframework.core.io.Resource resource = storageProvider.load(storageKey);
        return resource.getContentAsByteArray();
    }

    /** Deletes a workflow session and associated files. */
    @Transactional
    public void deleteSession(String sessionId, User owner) {
        WorkflowSession session = getSessionForOwner(sessionId, owner);

        if (session.isFinalized()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Cannot delete a finalized session. The signed PDF remains accessible from your session history.");
        }

        // Delete physical storage files (non-fatal; may already be absent)
        try {
            if (session.getOriginalFile() != null) {
                storageProvider.delete(session.getOriginalFile().getStorageKey());
            }
            if (session.getProcessedFile() != null) {
                storageProvider.delete(session.getProcessedFile().getStorageKey());
            }
        } catch (Exception e) {
            log.error("Error deleting files for session {}", sessionId, e);
        }

        // Clear only the StoredFile → WorkflowSession back-reference before deleting.
        //
        // We do NOT null session.originalFile here because that would emit an UPDATE with
        // original_file_id=NULL, violating the NOT NULL constraint.  There is no need to — a
        // DELETE statement removes the row entirely, so the NOT NULL constraint never triggers.
        //
        // We DO null StoredFile.workflowSession (workflow_session_id IS nullable) so that
        // Hibernate does not see a persistent StoredFile referencing a "removed" WorkflowSession
        // during flush, which would throw TransientPropertyValueException.
        StoredFile originalFile = session.getOriginalFile();
        StoredFile processedFile = session.getProcessedFile();
        if (originalFile != null) {
            originalFile.setWorkflowSession(null);
            storedFileRepository.save(originalFile);
        }
        if (processedFile != null) {
            processedFile.setWorkflowSession(null);
            storedFileRepository.save(processedFile);
        }

        // Delete the session row. Cascades to WorkflowParticipant via orphanRemoval=true.
        workflowSessionRepository.delete(session);

        // StoredFile rows can now be deleted — the workflow_sessions FK is gone.
        if (originalFile != null) storedFileRepository.delete(originalFile);
        if (processedFile != null) storedFileRepository.delete(processedFile);
        log.info("Deleted workflow session {}", sessionId);
    }

    /**
     * Deletes the original (presigned) file from storage after finalization. The original file is
     * no longer needed once the signed document has been stored. Non-fatal: logs errors but does
     * not fail finalization.
     */
    public void deleteOriginalFile(WorkflowSession session) {
        if (session.getOriginalFile() == null) {
            return;
        }
        try {
            storageProvider.delete(session.getOriginalFile().getStorageKey());
            StoredFile originalFile = session.getOriginalFile();
            session.setOriginalFile(null);
            workflowSessionRepository.save(session);
            storedFileRepository.delete(originalFile);
            log.info("Deleted original presigned file for session {}", session.getSessionId());
        } catch (Exception e) {
            log.error(
                    "Failed to delete original file for session {}: {}",
                    session.getSessionId(),
                    e.getMessage());
        }
    }

    // ===== SIGN REQUEST METHODS (Participant View) =====

    /**
     * List all sign requests where the user is a participant.
     *
     * @param user The participant user
     * @return List of sign request summaries
     */
    @Transactional(readOnly = true)
    public List<stirling.software.proprietary.workflow.dto.SignRequestSummaryDTO> listSignRequests(
            User user) {
        List<WorkflowParticipant> participations =
                workflowParticipantRepository.findByUserOrderByLastUpdatedDesc(user);

        return participations.stream()
                .map(
                        p -> {
                            WorkflowSession session = p.getWorkflowSession();
                            stirling.software.proprietary.workflow.dto.SignRequestSummaryDTO dto =
                                    new stirling.software.proprietary.workflow.dto
                                            .SignRequestSummaryDTO();
                            dto.setSessionId(session.getSessionId());
                            dto.setDocumentName(session.getDocumentName());
                            dto.setOwnerUsername(session.getOwner().getUsername());
                            dto.setCreatedAt(session.getCreatedAt().toString());
                            dto.setDueDate(
                                    session.getDueDate() != null
                                            ? session.getDueDate().toString()
                                            : null);
                            dto.setMyStatus(p.getStatus());
                            return dto;
                        })
                .collect(java.util.stream.Collectors.toList());
    }

    /**
     * Get detailed information about a sign request.
     *
     * @param sessionId The session ID
     * @param user The participant user
     * @return Sign request detail
     */
    @Transactional(readOnly = true)
    public stirling.software.proprietary.workflow.dto.SignRequestDetailDTO getSignRequestDetail(
            String sessionId, User user) {
        WorkflowSession session = getSession(sessionId);
        WorkflowParticipant participant = getParticipantForUser(session, user);

        stirling.software.proprietary.workflow.dto.SignRequestDetailDTO dto =
                new stirling.software.proprietary.workflow.dto.SignRequestDetailDTO();
        dto.setSessionId(session.getSessionId());
        dto.setDocumentName(session.getDocumentName());
        dto.setOwnerUsername(session.getOwner().getUsername());
        dto.setMessage(session.getMessage());
        dto.setDueDate(session.getDueDate());
        dto.setCreatedAt(session.getCreatedAt().toString());
        dto.setMyStatus(participant.getStatus());

        // Load signature appearance settings from workflow metadata
        Map<String, Object> metadata = session.getWorkflowMetadata();
        if (metadata != null && !metadata.isEmpty()) {
            dto.setShowSignature(
                    metadata.containsKey("showSignature")
                            ? (Boolean) metadata.get("showSignature")
                            : false);
            dto.setPageNumber(
                    metadata.containsKey("pageNumber")
                            ? ((Number) metadata.get("pageNumber")).intValue()
                            : null);
            dto.setReason(metadata.containsKey("reason") ? (String) metadata.get("reason") : null);
            dto.setLocation(
                    metadata.containsKey("location") ? (String) metadata.get("location") : null);
            dto.setShowLogo(
                    metadata.containsKey("showLogo") ? (Boolean) metadata.get("showLogo") : false);
        } else {
            // Default values if no metadata
            dto.setShowSignature(false);
            dto.setPageNumber(null);
            dto.setReason(null);
            dto.setLocation(null);
            dto.setShowLogo(false);
        }

        // Update status to VIEWED if it was NOTIFIED
        if (participant.getStatus() == ParticipantStatus.NOTIFIED) {
            participant.setStatus(ParticipantStatus.VIEWED);
            workflowParticipantRepository.save(participant);
        }

        return dto;
    }

    /**
     * Get the document for a sign request.
     *
     * <p>After finalization, returns the signed document. Before finalization, returns the
     * original.
     *
     * @param sessionId The session ID
     * @param user The participant user
     * @return PDF document bytes
     */
    @Transactional(readOnly = true)
    public byte[] getSignRequestDocument(String sessionId, User user) {
        WorkflowSession session = getSession(sessionId);
        getParticipantForUser(session, user); // Verify participant access

        // After finalization, serve the signed document instead of the original
        StoredFile fileToServe =
                (session.isFinalized() && session.getProcessedFile() != null)
                        ? session.getProcessedFile()
                        : session.getOriginalFile();

        if (fileToServe == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "Document not available for this session");
        }

        try {
            org.springframework.core.io.Resource resource =
                    storageProvider.load(fileToServe.getStorageKey());
            return resource.getContentAsByteArray();
        } catch (IOException e) {
            log.error("Failed to retrieve document for session {}", sessionId, e);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Failed to retrieve document");
        }
    }

    /**
     * Sign a document in a workflow session.
     *
     * @param sessionId The session ID
     * @param user The participant user
     * @param request Sign document request with certificate and optional wet signature
     */
    public void signDocument(
            String sessionId,
            User user,
            stirling.software.proprietary.workflow.dto.SignDocumentRequest request) {
        WorkflowSession session = getSession(sessionId);
        WorkflowParticipant participant = getParticipantForUser(session, user);

        if (participant.getStatus() == ParticipantStatus.SIGNED) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Document already signed by this user");
        }

        if (participant.getStatus() == ParticipantStatus.DECLINED) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Cannot sign after declining");
        }

        // Build metadata JSON containing certificate submission and wet signature data
        // Merge with existing metadata if present (preserves owner-configured appearance
        // settings)
        Map<String, Object> metadata = new HashMap<>();

        // Get existing metadata if present
        Map<String, Object> existingMetadata = participant.getParticipantMetadata();
        if (existingMetadata != null && !existingMetadata.isEmpty()) {
            metadata = new HashMap<>(existingMetadata);
        }

        // 1. Validate certificate before storing — throws 400 if invalid, expired, or wrong
        // password
        if (request.getCertType() != null
                && !"SERVER".equalsIgnoreCase(request.getCertType())
                && request.getP12File() != null
                && !request.getP12File().isEmpty()) {
            try {
                certificateSubmissionValidator.validateAndExtractInfo(
                        request.getP12File().getBytes(),
                        request.getCertType(),
                        request.getPassword());
            } catch (ResponseStatusException e) {
                throw e;
            } catch (IOException e) {
                log.error("Failed to read P12 keystore file for validation", e);
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Failed to process certificate file");
            }
        }

        // 2. Store certificate submission data
        Map<String, Object> certSubmission = new HashMap<>();
        certSubmission.put("certType", request.getCertType());
        certSubmission.put("password", metadataEncryptionService.encrypt(request.getPassword()));

        // Store keystore files as base64 if provided
        if (request.getP12File() != null && !request.getP12File().isEmpty()) {
            try {
                byte[] keystoreBytes = request.getP12File().getBytes();
                String base64Keystore = java.util.Base64.getEncoder().encodeToString(keystoreBytes);
                certSubmission.put("p12Keystore", base64Keystore);
            } catch (IOException e) {
                log.error("Failed to read P12 keystore file", e);
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Failed to process certificate file");
            }
        }

        // Note: Signature appearance settings (showSignature, pageNumber, location, reason,
        // showLogo)
        // may already be in metadata if owner configured them when adding participant.
        // If not present, the finalization process will use defaults.

        metadata.put("certificateSubmission", certSubmission);

        // 2. Parse wet signatures from JSON string if provided
        if (request.getWetSignaturesData() != null && !request.getWetSignaturesData().isBlank()) {
            try {
                List<WetSignatureMetadata> wetSigs =
                        objectMapper.readValue(
                                request.getWetSignaturesData(),
                                new TypeReference<List<WetSignatureMetadata>>() {});
                if (wetSigs.size() > WetSignatureMetadata.MAX_SIGNATURES_PER_PARTICIPANT) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "Too many wet signatures submitted");
                }
                request.setWetSignatures(wetSigs);
                log.info("Parsed {} wet signatures from wetSignaturesData", wetSigs.size());
            } catch (JacksonException e) {
                log.error("Failed to parse wetSignaturesData: {}", e.getMessage());
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Invalid wet signatures data");
            }
        }

        // 3. Store wet signatures metadata if provided (supports multiple signatures)
        if (request.hasWetSignatures()) {
            List<WetSignatureMetadata> wetSigs = request.extractWetSignatureMetadata();
            List<Map<String, Object>> wetSignatures = new ArrayList<>();

            for (WetSignatureMetadata wetSig : wetSigs) {
                Map<String, Object> wetSignature = new HashMap<>();
                wetSignature.put("type", wetSig.getType());
                wetSignature.put("data", wetSig.getData());
                wetSignature.put("page", wetSig.getPage());
                wetSignature.put("x", wetSig.getX());
                wetSignature.put("y", wetSig.getY());
                wetSignature.put("width", wetSig.getWidth());
                wetSignature.put("height", wetSig.getHeight());
                wetSignatures.add(wetSignature);
            }

            // Always store as array
            metadata.put("wetSignatures", wetSignatures);

            log.info(
                    "Stored {} wet signature(s) metadata for participant {}",
                    wetSignatures.size(),
                    user.getUsername());
        }

        // 4. Store metadata in participant (JPA converter handles JSON serialization)
        participant.setParticipantMetadata(metadata);
        log.info(
                "Stored signature metadata for participant ID {}, email {}: {} wet signatures, cert type: {}",
                participant.getId(),
                user.getUsername(),
                metadata.containsKey("wetSignatures")
                        ? ((List<?>) metadata.get("wetSignatures")).size()
                        : 0,
                ((Map<?, ?>) metadata.get("certificateSubmission")).get("certType"));

        // 5. Update participant status
        participant.setStatus(ParticipantStatus.SIGNED);
        workflowParticipantRepository.save(participant);

        log.info(
                "User {} signed document in session {} - certificate and signature data stored",
                user.getUsername(),
                sessionId);
    }

    /**
     * Decline a sign request.
     *
     * @param sessionId The session ID
     * @param user The participant user
     */
    public void declineSignRequest(String sessionId, User user) {
        WorkflowSession session = getSession(sessionId);
        WorkflowParticipant participant = getParticipantForUser(session, user);

        if (participant.getStatus() == ParticipantStatus.SIGNED) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Cannot decline after signing");
        }

        participant.setStatus(ParticipantStatus.DECLINED);
        workflowParticipantRepository.save(participant); // updatedAt is auto-updated

        log.info("User {} declined sign request for session {}", user.getUsername(), sessionId);
    }

    /**
     * Get participant record for a user in a session.
     *
     * @param session The workflow session
     * @param user The user
     * @return Participant record
     * @throws ResponseStatusException if user is not a participant
     */
    private WorkflowParticipant getParticipantForUser(WorkflowSession session, User user) {
        return session.getParticipants().stream()
                .filter(p -> p.getUser() != null && p.getUser().equals(user))
                .findFirst()
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.FORBIDDEN,
                                        "User is not a participant in this session"));
    }

    /** Helper class to wrap byte array as MultipartFile. */
    private static class ByteArrayMultipartFile implements MultipartFile {
        private final byte[] content;
        private final String filename;

        public ByteArrayMultipartFile(byte[] content, String filename) {
            this.content = content;
            this.filename = filename;
        }

        @Override
        public String getName() {
            return "file";
        }

        @Override
        public String getOriginalFilename() {
            return filename;
        }

        @Override
        public String getContentType() {
            return "application/pdf";
        }

        @Override
        public boolean isEmpty() {
            return content == null || content.length == 0;
        }

        @Override
        public long getSize() {
            return content.length;
        }

        @Override
        public byte[] getBytes() {
            return content;
        }

        @Override
        public java.io.InputStream getInputStream() {
            return new java.io.ByteArrayInputStream(content);
        }

        @Override
        public void transferTo(java.io.File dest) throws IOException {
            java.nio.file.Files.write(dest.toPath(), content);
        }
    }
}
