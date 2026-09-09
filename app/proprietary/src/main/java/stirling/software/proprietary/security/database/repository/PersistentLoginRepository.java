package stirling.software.proprietary.security.database.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.proprietary.security.model.PersistentLogin;

public interface PersistentLoginRepository extends JpaRepository<PersistentLogin, String> {
    void deleteByUsername(String username);
}
