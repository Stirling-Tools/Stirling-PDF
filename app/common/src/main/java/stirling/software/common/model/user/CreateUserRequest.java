package stirling.software.common.model.user;

/** Request object for creating a new user. Used by administrators to create user accounts. */
public record CreateUserRequest(
        String username,
        String password,
        String role,
        Long teamId,
        String authType,
        boolean forceChange) {}
