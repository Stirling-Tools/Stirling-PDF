package stirling.software.proprietary.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.model.UserCredits;

@Repository
public interface UserCreditsRepository extends JpaRepository<UserCredits, Long> {

    Optional<UserCredits> findByUserId(Long userId);

    /** Find all credit records whose weekly reset date has passed. */
    List<UserCredits> findByWeeklyResetDateBefore(LocalDateTime dateTime);
}
