package stirling.software.proprietary.workflow.util;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.ObjectMapper;

import stirling.software.proprietary.workflow.dto.ParticipantResponse;
import stirling.software.proprietary.workflow.dto.WetSignatureMetadata;
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
        return toResponse(session, null, true);
    }

    /**
     * Converts a WorkflowSession entity to a response DTO with optional wet signature extraction.
     *
     * @param session The workflow session entity
     * @param objectMapper ObjectMapper for JSON processing (null to skip wet signature extraction)
     * @return WorkflowSessionResponse with participants (and wet signatures if objectMapper
     *     provided)
     */
    public static WorkflowSessionResponse toResponse(
            WorkflowSession session, ObjectMapper objectMapper) {
        return toResponse(session, objectMapper, true);
    }

    /**
     * Converts a WorkflowSession entity to a response DTO.
     *
     * @param session The workflow session entity
     * @param objectMapper ObjectMapper for JSON processing (null to skip wet signature extraction)
     * @param includeShareTokens Whether to include each participant's share token in the response.
     *     Owner-facing endpoints set this to true so the owner can distribute share links;
     *     participant-facing endpoints set this to false so a single participant's token cannot be
     *     used to enumerate peer bearer tokens (GHSA-qgg6-mxw4-xg62).
     */
    public static WorkflowSessionResponse toResponse(
            WorkflowSession session, ObjectMapper objectMapper, boolean includeShareTokens) {
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

        // Convert participants (with wet signatures if objectMapper provided)
        if (objectMapper != null) {
            response.setParticipants(
                    session.getParticipants().stream()
                            .map(p -> toParticipantResponse(p, objectMapper, includeShareTokens))
                            .collect(Collectors.toList()));
        } else {
            response.setParticipants(
                    session.getParticipants().stream()
                            .map(p -> toParticipantResponse(p, includeShareTokens))
                            .collect(Collectors.toList()));
        }

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

    /** Converts a WorkflowParticipant entity to a response DTO, including the share token. */
    public static ParticipantResponse toParticipantResponse(WorkflowParticipant participant) {
        return toParticipantResponse(participant, true);
    }

    /**
     * Converts a WorkflowParticipant entity to a response DTO.
     *
     * @param participant The participant entity
     * @param includeShareToken Whether to include the participant's share token in the response.
     *     Owner-facing endpoints set this to true; participant-facing endpoints set this to false
     *     so the response cannot be used to enumerate peer bearer tokens (GHSA-qgg6-mxw4-xg62).
     */
    public static ParticipantResponse toParticipantResponse(
            WorkflowParticipant participant, boolean includeShareToken) {
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
        if (includeShareToken) {
            response.setShareToken(participant.getShareToken());
        }
        response.setAccessRole(participant.getAccessRole());
        response.setExpiresAt(participant.getExpiresAt());
        response.setLastUpdated(participant.getLastUpdated());
        response.setHasCompleted(participant.hasCompleted());
        response.setExpired(
                participant.isExpired()); // Lombok generates setExpired() for isExpired field

        return response;
    }

    /**
     * Converts a WorkflowParticipant entity to a response DTO with wet signatures extracted.
     *
     * @param participant The participant entity
     * @param objectMapper ObjectMapper for JSON processing
     * @return ParticipantResponse with wet signatures included
     */
    public static ParticipantResponse toParticipantResponse(
            WorkflowParticipant participant, ObjectMapper objectMapper) {
        return toParticipantResponse(participant, objectMapper, true);
    }

    /**
     * Converts a WorkflowParticipant entity to a response DTO with wet signatures extracted.
     *
     * @param participant The participant entity
     * @param objectMapper ObjectMapper for JSON processing
     * @param includeShareToken Whether to include the participant's share token in the response.
     */
    public static ParticipantResponse toParticipantResponse(
            WorkflowParticipant participant, ObjectMapper objectMapper, boolean includeShareToken) {
        ParticipantResponse response = toParticipantResponse(participant, includeShareToken);
        if (response != null) {
            response.setWetSignatures(extractWetSignatures(participant, objectMapper));
        }
        return response;
    }

    /**
     * Extracts wet signature metadata from a participant's metadata JSON field.
     *
     * @param participant The participant entity
     * @param objectMapper ObjectMapper for JSON processing
     * @return List of wet signatures, empty if none found
     */
    private static List<WetSignatureMetadata> extractWetSignatures(
            WorkflowParticipant participant, ObjectMapper objectMapper) {
        List<WetSignatureMetadata> signatures = new ArrayList<>();

        Map<String, Object> metadata = participant.getParticipantMetadata();
        if (metadata == null || metadata.isEmpty() || !metadata.containsKey("wetSignatures")) {
            return signatures;
        }

        try {
            // Convert metadata to JsonNode for processing
            var node = objectMapper.valueToTree(metadata);
            if (node.has("wetSignatures")) {
                var wetSigsNode = node.get("wetSignatures");
                if (wetSigsNode.isArray()) {
                    for (var wetSigNode : wetSigsNode) {
                        WetSignatureMetadata wetSig =
                                objectMapper.treeToValue(wetSigNode, WetSignatureMetadata.class);
                        signatures.add(wetSig);
                    }
                }
            }
        } catch (Exception e) {
            // Log error but don't fail the entire response
            // In production, you might want to use a logger here
            return signatures;
        }

        return signatures;
    }
}
