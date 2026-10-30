package stirling.software.proprietary.security.database.repository;

import java.util.Optional;

import org.hibernate.KeyType;
import org.hibernate.Session;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import stirling.software.proprietary.cache.CacheEviction;
import stirling.software.proprietary.cache.CacheEvictionBroadcaster;
import stirling.software.proprietary.security.model.User;

/** See {@link UserRepositoryCustom}. */
class UserRepositoryCustomImpl implements UserRepositoryCustom {

    @PersistenceContext private EntityManager entityManager;

    private final ObjectProvider<CacheEvictionBroadcaster> cacheEvictionBroadcaster;

    UserRepositoryCustomImpl(ObjectProvider<CacheEvictionBroadcaster> cacheEvictionBroadcaster) {
        this.cacheEvictionBroadcaster = cacheEvictionBroadcaster;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<User> findByUsernameNatural(String username) {
        return Optional.ofNullable(
                entityManager.unwrap(Session.class).find(User.class, username, KeyType.NATURAL));
    }

    @Override
    @Transactional
    public int updateUserTeamId(Long userId, Long teamId) {
        int updated =
                entityManager
                        .createQuery("UPDATE User u SET u.team.id = :teamId WHERE u.id = :userId")
                        .setParameter("teamId", teamId)
                        .setParameter("userId", userId)
                        .executeUpdate();
        cacheEvictionBroadcaster.ifAvailable(
                broadcaster ->
                        broadcaster.broadcastToPeersAfterCommit(
                                CacheEviction.entity(User.class.getName(), userId.toString())));
        return updated;
    }
}
