package stirling.software.proprietary.workflow.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.workflow.model.UserServerCertificateEntity;

@Repository
public interface UserServerCertificateRepository
        extends JpaRepository<UserServerCertificateEntity, Long> {

    @Query("SELECT c FROM UserServerCertificateEntity c WHERE c.user.id = :userId")
    Optional<UserServerCertificateEntity> findByUserId(@Param("userId") Long userId);

    @Query("SELECT c FROM UserServerCertificateEntity c WHERE c.user.username = :username")
    Optional<UserServerCertificateEntity> findByUsername(@Param("username") String username);

    boolean existsByUserId(Long userId);
}
