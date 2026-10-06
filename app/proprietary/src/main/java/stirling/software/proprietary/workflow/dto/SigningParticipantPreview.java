package stirling.software.proprietary.workflow.dto;

import java.util.List;

import stirling.software.proprietary.workflow.model.ParticipantStatus;

/** Participant-visible progress and submitted marks, excluding credentials and share tokens. */
public record SigningParticipantPreview(
        Long id, String name, ParticipantStatus status, List<WetSignatureMetadata> wetSignatures) {}
