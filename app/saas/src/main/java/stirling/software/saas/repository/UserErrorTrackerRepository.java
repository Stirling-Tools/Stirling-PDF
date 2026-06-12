package stirling.software.saas.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.UserErrorTracker;

@ApplicationScoped
public class UserErrorTrackerRepository implements PanacheRepositoryBase<UserErrorTracker, Long> {

    public Optional<UserErrorTracker> findByUserAndEndpoint(User user, String endpoint) {
        return find("user = ?1 and endpoint = ?2", user, endpoint).firstResultOptional();
    }

    public Optional<UserErrorTracker> findByUserIdAndEndpoint(Long userId, String endpoint) {
        return find("user.id = ?1 and endpoint = ?2", userId, endpoint).firstResultOptional();
    }

    public Optional<UserErrorTracker> findByUserApiKeyAndEndpoint(String apiKey, String endpoint) {
        return find("user.apiKey = ?1 and endpoint = ?2", apiKey, endpoint).firstResultOptional();
    }

    public List<UserErrorTracker> findExpiredErrorTrackers(LocalDateTime currentDateTime) {
        return find("resetAfter <= ?1", currentDateTime).list();
    }

    @Transactional
    public int deleteExpiredErrorTrackers(LocalDateTime currentDateTime) {
        return (int) delete("resetAfter <= ?1", currentDateTime);
    }

    public List<UserErrorTracker> findHighErrorCountForUser(User user) {
        return find("user = ?1 and processingErrorCount >= 3", user).list();
    }

    public Long countUsersWithHighErrorCount(int threshold) {
        return count("processingErrorCount >= ?1", threshold);
    }
}
