package stirling.software.SPDF.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.SPDF.model.User;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsernameIgnoreCase(String username);

    @Query("FROM User u LEFT JOIN FETCH u.settings where upper(u.username) = upper(:username)")
    Optional<User> findByUsernameIgnoreCaseWithSettings(@Param("username") String username);

    Optional<User> findByUsername(String username);

    Optional<User> findByApiKey(String apiKey);

    List<User> findByAuthenticationTypeIgnoreCase(String authenticationType);
}
