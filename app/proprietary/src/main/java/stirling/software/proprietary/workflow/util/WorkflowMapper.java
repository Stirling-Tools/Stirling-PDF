package stirling.software.proprietary.workflow.util;

import java.util.stream.Collectors;

import stirling.software.proprietary.workflow.dto.ParticipantResponse;
import stirling.software.proprietary.workflow.dto.WorkflowSessionResponse;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;

/**
 * Utility class for mapping workflow entities to DTOs. Centralizes conversion logic for consistent
 * API responses.
 */
public class WorkflowMapper {

    /** Converts a WorkflowSession entity to a response DTO. */
    public static WorkflowSessionResponse toResponse(WorkflowSession session) {
        if (session == null) {
            return null;
        }

        WorkflowSessionResponse response = new WorkflowSessionResponse();
        response.setSessionId(session.getSessionId());
        response.setOwnerId(session.getOwner().getId());
        response.setOwnerUsername(session.getOwner().getUsername());
        response.setWorkflowType(session.getWorkflowType());
        response.setDocumentName(session.getDocumentName());
        response.setOwnerEmail(session.getOwnerEmail());
        response.setMessage(session.getMessage());
        response.setDueDate(session.getDueDate());
        response.setStatus(session.getStatus());
        response.setFinalized(session.isFinalized());
        response.setCreatedAt(session.getCreatedAt());
        response.setUpdatedAt(session.getUpdatedAt());
        response.setHasProcessedFile(session.hasProcessedFile());

        if (session.getOriginalFile() != null) {
            response.setOriginalFileId(session.getOriginalFile().getId());
        }
        if (session.getProcessedFile() != null) {
            response.setProcessedFileId(session.getProcessedFile().getId());
        }

        // Convert participants
        response.setParticipants(
                session.getParticipants().stream()
                        .map(WorkflowMapper::toParticipantResponse)
                        .collect(Collectors.toList()));

        // Calculate participant counts
        response.setParticipantCount(session.getParticipants().size());
        response.setSignedCount(
                (int)
                        session.getParticipants().stream()
                                .filter(
                                        p ->
                                                p.getStatus()
                                                        == stirling.software.proprietary.workflow
                                                                .model.ParticipantStatus.SIGNED)
                                .count());

        return response;
    }

    /** Converts a WorkflowParticipant entity to a response DTO. */
    public static ParticipantResponse toParticipantResponse(WorkflowParticipant participant) {
        if (participant == null) {
            return null;
        }

        ParticipantResponse response = new ParticipantResponse();
        response.setId(participant.getId());
        if (participant.getUser() != null) {
            response.setUserId(participant.getUser().getId());
        }
        response.setEmail(participant.getEmail());
        response.setName(participant.getName());
        response.setStatus(participant.getStatus());
        response.setShareToken(participant.getShareToken());
        response.setAccessRole(participant.getAccessRole());
        response.setExpiresAt(participant.getExpiresAt());
        response.setLastUpdated(participant.getLastUpdated());
        response.setHasCompleted(participant.hasCompleted());
        response.setExpired(
                participant.isExpired()); // Lombok generates setExpired() for isExpired field

        return response;
    }
}
