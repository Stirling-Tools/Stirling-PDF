package stirling.software.SPDF.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import stirling.software.SPDF.model.User;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsernameIgnoreCase(String username);

    @Query("FROM User u LEFT JOIN FETCH u.settings where upper(u.username) = upper(:username)")
    Optional<User> findByUsernameIgnoreCaseWithSettings(String username);

    Optional<User> findByUsername(String username);

    Optional<User> findByApiKey(String apiKey);
}
