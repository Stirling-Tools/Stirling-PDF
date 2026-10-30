package stirling.software.proprietary.security.database.repository;

import java.util.Optional;

import stirling.software.proprietary.security.model.User;

public interface UserRepositoryCustom {

    /**
     * Returns the user when the username resolves. Unlike the derived {@code findByUsername} query,
     * this goes through the natural-id cache and the entity cache.
     */
    Optional<User> findByUsernameNatural(String username);

    int updateUserTeamId(Long userId, Long teamId);
}
