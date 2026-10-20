package stirling.software.proprietary.security.database.repository;

import java.util.Optional;

import stirling.software.proprietary.security.model.User;

/** User queries that need the second-level cache in view. */
public interface UserRepositoryCustom {

    /**
     * Returns the user when the username resolves. Unlike the derived {@code findByUsername} query,
     * this goes through the natural-id cache and the entity cache.
     */
    Optional<User> findByUsernameNatural(String username);

    /**
     * Single-shot UPDATE that reassigns a user to a different team, evicting that user on every
     * node once the transaction commits.
     */
    int updateUserTeamId(Long userId, Long teamId);
}
