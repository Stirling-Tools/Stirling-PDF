package stirling.software.proprietary.workflow.notification;

import java.util.List;

/**
 * Participants were added to a signing session and should be emailed an invitation.
 *
 * @param sessionId the public session UUID
 * @param participantIds the added participants to invite; other participants are not re-invited
 */
public record SigningInvitationEvent(String sessionId, List<Long> participantIds) {}
