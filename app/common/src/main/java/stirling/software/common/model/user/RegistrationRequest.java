package stirling.software.common.model.user;

/**
 * Request object for user self-registration. Simpler than CreateUserRequest as it only requires
 * username and password.
 */
public record RegistrationRequest(String username, String password) {}
