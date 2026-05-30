package stirling.software.saas.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.UserErrorTracker;

public interface UserErrorTrackerRepository extends JpaRepository<UserErrorTracker, Long> {

    Optional<UserErrorTracker> findByUserAndEndpoint(User user, String endpoint);

    Optional<UserErrorTracker> findByUserIdAndEndpoint(Long userId, String endpoint);

    @Query(
            "SELECT uet FROM UserErrorTracker uet WHERE uet.user.apiKey = :apiKey AND uet.endpoint = :endpoint")
    Optional<UserErrorTracker> findByUserApiKeyAndEndpoint(
            @Param("apiKey") String apiKey, @Param("endpoint") String endpoint);

    @Query("SELECT uet FROM UserErrorTracker uet WHERE uet.resetAfter <= :currentDateTime")
    List<UserErrorTracker> findExpiredErrorTrackers(
            @Param("currentDateTime") LocalDateTime currentDateTime);

    @Modifying
    @Query("DELETE FROM UserErrorTracker uet WHERE uet.resetAfter <= :currentDateTime")
    int deleteExpiredErrorTrackers(@Param("currentDateTime") LocalDateTime currentDateTime);

    @Query(
            "SELECT uet FROM UserErrorTracker uet WHERE uet.user = :user AND uet.processingErrorCount >= 3")
    List<UserErrorTracker> findHighErrorCountForUser(@Param("user") User user);

    @Query(
            "SELECT COUNT(uet) FROM UserErrorTracker uet WHERE uet.processingErrorCount >= :threshold")
    Long countUsersWithHighErrorCount(@Param("threshold") int threshold);
}
