package stirling.software.proprietary.security.database.repository;

import java.util.Optional;

import org.hibernate.KeyType;
import org.hibernate.Session;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import stirling.software.proprietary.security.model.User;

/** See {@link UserRepositoryCustom}. */
class UserRepositoryCustomImpl implements UserRepositoryCustom {

    @PersistenceContext private EntityManager entityManager;

    @Override
    @Transactional(readOnly = true)
    public Optional<User> findByUsernameNatural(String username) {
        return Optional.ofNullable(
                entityManager.unwrap(Session.class).find(User.class, username, KeyType.NATURAL));
    }
}
