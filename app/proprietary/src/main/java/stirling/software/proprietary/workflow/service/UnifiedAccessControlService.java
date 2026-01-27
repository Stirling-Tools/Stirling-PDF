package stirling.software.proprietary.workflow.service;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.repository.FileShareRepository;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;

/**
 * Unified access control service that consolidates validation logic for both generic file shares
 * and workflow participants.
 *
 * <p>This service bridges the gap between the file sharing infrastructure and workflow-specific
 * access control.
 */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class UnifiedAccessControlService {

    private final FileShareRepository fileShareRepository;
    private final WorkflowParticipantRepository workflowParticipantRepository;

    /**
     * Validates a share token and returns access validation result. Works for both generic file
     * shares and workflow participant shares.
     */
    public AccessValidationResult validateToken(String token, User user) {
        log.debug("Validating access token: {}", token);

        // First try as file share token
        Optional<FileShare> fileShareOpt = fileShareRepository.findByShareTokenWithFile(token);
        if (fileShareOpt.isPresent()) {
            FileShare share = fileShareOpt.get();

            // Check if it's a workflow share
            if (share.isWorkflowShare()) {
                return validateWorkflowShare(share, user);
            } else {
                return validateGenericShare(share, user);
            }
        }

        // Try as workflow participant token
        Optional<WorkflowParticipant> participantOpt =
                workflowParticipantRepository.findByShareToken(token);
        if (participantOpt.isPresent()) {
            return validateParticipant(participantOpt.get(), user);
        }

        log.warn("Invalid or expired token: {}", token);
        return AccessValidationResult.denied("Invalid or expired access token");
    }

    /** Validates a generic file share (non-workflow) */
    private AccessValidationResult validateGenericShare(FileShare share, User user) {
        // Check expiration
        if (share.getExpiresAt() != null && LocalDateTime.now().isAfter(share.getExpiresAt())) {
            log.warn("Share token expired: {}", share.getShareToken());
            return AccessValidationResult.denied("Access link has expired");
        }

        // Check if user matches (if share is user-specific)
        if (share.getSharedWithUser() != null && !share.getSharedWithUser().equals(user)) {
            log.warn(
                    "User mismatch for share: expected {}, got {}",
                    share.getSharedWithUser().getId(),
                    user != null ? user.getId() : "null");
            return AccessValidationResult.denied("Access denied for this user");
        }

        return AccessValidationResult.allowed(share.getFile(), share.getAccessRole(), null, false);
    }

    /** Validates a workflow share (FileShare linked to WorkflowParticipant) */
    private AccessValidationResult validateWorkflowShare(FileShare share, User user) {
        WorkflowParticipant participant = share.getWorkflowParticipant();

        // Check expiration
        if (participant.isExpired()) {
            log.warn("Workflow participant access expired: {}", participant.getShareToken());
            return AccessValidationResult.denied("Workflow access has expired");
        }

        // Check if workflow is still active
        if (!participant.getWorkflowSession().isActive()) {
            log.info(
                    "Workflow session no longer active: {}",
                    participant.getWorkflowSession().getSessionId());
            return AccessValidationResult.denied("Workflow session is no longer active");
        }

        // Get effective role based on participant status
        ShareAccessRole effectiveRole = getEffectiveRole(participant);

        return AccessValidationResult.allowed(share.getFile(), effectiveRole, participant, true);
    }

    /** Validates a workflow participant by token */
    private AccessValidationResult validateParticipant(WorkflowParticipant participant, User user) {
        // Check expiration
        if (participant.isExpired()) {
            log.warn("Workflow participant access expired: {}", participant.getShareToken());
            return AccessValidationResult.denied("Workflow access has expired");
        }

        // Check if workflow is still active
        if (!participant.getWorkflowSession().isActive()) {
            log.info(
                    "Workflow session no longer active: {}",
                    participant.getWorkflowSession().getSessionId());
            return AccessValidationResult.denied("Workflow session is no longer active");
        }

        // Check user authorization
        if (participant.getUser() != null && !participant.getUser().equals(user)) {
            log.warn(
                    "User mismatch for participant: expected {}, got {}",
                    participant.getUser().getId(),
                    user != null ? user.getId() : "null");
            return AccessValidationResult.denied("Access denied for this user");
        }

        // Get effective role based on participant status
        ShareAccessRole effectiveRole = getEffectiveRole(participant);

        // Get the file from the workflow session
        StoredFile file = participant.getWorkflowSession().getOriginalFile();

        return AccessValidationResult.allowed(file, effectiveRole, participant, true);
    }

    /**
     * Maps participant status to effective access role. After completion (signed/declined),
     * downgrade to VIEWER.
     */
    public ShareAccessRole getEffectiveRole(WorkflowParticipant participant) {
        ParticipantStatus status = participant.getStatus();

        switch (status) {
            case SIGNED:
            case DECLINED:
                // After action completed, downgrade to read-only
                return ShareAccessRole.VIEWER;
            case PENDING:
            case NOTIFIED:
            case VIEWED:
                // Active participants retain their assigned role
                return participant.getAccessRole();
            default:
                log.warn("Unknown participant status: {}", status);
                return ShareAccessRole.VIEWER;
        }
    }

    /** Checks if a user can access a specific file */
    public boolean canAccessFile(User user, StoredFile file) {
        // Owner always has access
        if (file.getOwner().equals(user)) {
            return true;
        }

        // Check for file share
        Optional<FileShare> share = fileShareRepository.findByFileAndSharedWithUser(file, user);
        if (share.isPresent() && !isExpired(share.get())) {
            return true;
        }

        // Check for workflow participant access
        if (file.getWorkflowSession() != null) {
            Optional<WorkflowParticipant> participant =
                    workflowParticipantRepository.findByWorkflowSessionAndUser(
                            file.getWorkflowSession(), user);
            return participant.isPresent()
                    && !participant.get().isExpired()
                    && participant.get().getWorkflowSession().isActive();
        }

        return false;
    }

    private boolean isExpired(FileShare share) {
        return share.getExpiresAt() != null && LocalDateTime.now().isAfter(share.getExpiresAt());
    }

    /** Result of access validation */
    public static class AccessValidationResult {
        private final boolean allowed;
        private final String denialReason;
        private final StoredFile file;
        private final ShareAccessRole role;
        private final WorkflowParticipant participant;
        private final boolean isWorkflowAccess;

        private AccessValidationResult(
                boolean allowed,
                String denialReason,
                StoredFile file,
                ShareAccessRole role,
                WorkflowParticipant participant,
                boolean isWorkflowAccess) {
            this.allowed = allowed;
            this.denialReason = denialReason;
            this.file = file;
            this.role = role;
            this.participant = participant;
            this.isWorkflowAccess = isWorkflowAccess;
        }

        public static AccessValidationResult allowed(
                StoredFile file,
                ShareAccessRole role,
                WorkflowParticipant participant,
                boolean isWorkflowAccess) {
            return new AccessValidationResult(
                    true, null, file, role, participant, isWorkflowAccess);
        }

        public static AccessValidationResult denied(String reason) {
            return new AccessValidationResult(false, reason, null, null, null, false);
        }

        public boolean isAllowed() {
            return allowed;
        }

        public String getDenialReason() {
            return denialReason;
        }

        public StoredFile getFile() {
            return file;
        }

        public ShareAccessRole getRole() {
            return role;
        }

        public WorkflowParticipant getParticipant() {
            return participant;
        }

        public boolean isWorkflowAccess() {
            return isWorkflowAccess;
        }

        public boolean canEdit() {
            return allowed && (role == ShareAccessRole.EDITOR || role == ShareAccessRole.COMMENTER);
        }
    }
}
