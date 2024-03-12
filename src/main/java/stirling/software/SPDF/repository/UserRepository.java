package stirling.software.SPDF.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import stirling.software.SPDF.model.User;

public interface UserRepository extends JpaRepository<User, String> {
    @Query(
            "SELECT u FROM User u WHERE "
                    + "(:ignoreCase = false AND u.username = :username) OR "
                    + "(:ignoreCase = true AND LOWER(u.username) = LOWER(:username))")
    Optional<User> findByUsername(
            @Param("username") String username, @Param("ignoreCase") boolean ignoreCase);

    Optional<User> findByUsername(String username);

    User findByApiKey(String apiKey);
}
