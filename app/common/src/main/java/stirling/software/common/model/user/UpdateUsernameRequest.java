package stirling.software.common.model.user;

/**
 * Request object for updating a user's username. Requires the current password for verification.
 */
public record UpdateUsernameRequest(String currentPassword, String newUsername) {}
