package stirling.software.SPDF.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.SPDF.model.PersistentLogin;

public interface PersistentLoginRepository extends JpaRepository<PersistentLogin, String> {
}
