package stirling.software.proprietary.workflow.notification;

/**
 * A participant signed or declined. The listener reads which from the participant's stored status,
 * so publish only after that status is saved.
 *
 * @param declineReason free text from the participant, or null
 */
public record SigningResponseEvent(Long participantId, String declineReason) {}
