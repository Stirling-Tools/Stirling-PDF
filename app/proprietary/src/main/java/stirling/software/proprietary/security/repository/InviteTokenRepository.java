package stirling.software.proprietary.security.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import io.quarkus.hibernate.orm.panache.PanacheRepository;
import io.quarkus.panache.common.Parameters;

import stirling.software.proprietary.security.model.InviteToken;

@ApplicationScoped
public class InviteTokenRepository implements PanacheRepository<InviteToken> {

    public Optional<InviteToken> findByToken(String token) {
        return find("token", token).firstResultOptional();
    }

    public Optional<InviteToken> findByEmail(String email) {
        return find("email", email).firstResultOptional();
    }

    public List<InviteToken> findByUsedFalseAndExpiresAtAfter(LocalDateTime now) {
        return find("used = false and expiresAt > ?1", now).list();
    }

    public List<InviteToken> findByCreatedBy(String createdBy) {
        return find("createdBy", createdBy).list();
    }

    @Transactional
    public void deleteExpiredTokens(LocalDateTime now) {
        delete("expiresAt < :now", Parameters.with("now", now));
    }

    public long countActiveInvites(LocalDateTime now) {
        return count("used = false and expiresAt > :now", Parameters.with("now", now));
    }
}
