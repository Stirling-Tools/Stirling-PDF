package stirling.software.SPDF.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.SPDF.model.User;

public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByUsername(String username);

    User findByApiKey(String apiKey);
}
