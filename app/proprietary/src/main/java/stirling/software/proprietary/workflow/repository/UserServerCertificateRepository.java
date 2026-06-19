package stirling.software.proprietary.workflow.repository;

import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepository;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.proprietary.workflow.model.UserServerCertificateEntity;

@ApplicationScoped
public class UserServerCertificateRepository
        implements PanacheRepository<UserServerCertificateEntity> {

    public Optional<UserServerCertificateEntity> findByUserId(Long userId) {
        return find("user.id = ?1", userId).firstResultOptional();
    }

    public Optional<UserServerCertificateEntity> findByUsername(String username) {
        return find("user.username = ?1", username).firstResultOptional();
    }

    public boolean existsByUserId(Long userId) {
        return count("user.id = ?1", userId) > 0;
    }
}
