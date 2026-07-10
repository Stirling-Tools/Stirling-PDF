package stirling.software.proprietary.security.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.security.model.ApiKey;

@Repository
public interface ApiKeyRepository extends JpaRepository<ApiKey, Long> {

    Optional<ApiKey> findByKeyHash(String keyHash);

    boolean existsByKeyHash(String keyHash);

    List<ApiKey> findByOwnerUserIdOrderByCreatedAtDesc(Long ownerUserId);

    List<ApiKey> findByTeamIdOrderByCreatedAtDesc(Long teamId);
}
