package stirling.software.common.service;

/**
 * Service interface for team management operations. Teams are used to group users together.
 *
 * @param <T> the team type (implementation-specific)
 */
public interface TeamServiceInterface<T> {

    /**
     * Gets or creates the default team. All new users are typically added to this team.
     *
     * @return the default team
     */
    T getOrCreateDefaultTeam();

    /**
     * Gets or creates the internal team. Used for internal system users.
     *
     * @return the internal team
     */
    T getOrCreateInternalTeam();
}
