package stirling.software.common.model.user;

/**
 * Request object for updating a user's password. Requires the current password for verification.
 */
public record UpdatePasswordRequest(String currentPassword, String newPassword) {}
