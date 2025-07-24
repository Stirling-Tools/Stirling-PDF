package stirling.software.proprietary.security.database.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.security.model.JwtSigningKey;

@Repository
public interface JwtSigningKeyRepository extends JpaRepository<JwtSigningKey, Long> {

    Optional<JwtSigningKey> findByIsActiveTrue();

    Optional<JwtSigningKey> findByKeyId(String keyId);

    Optional<JwtSigningKey> findByKeyIdAndIsActiveTrue(String keyId);
}
