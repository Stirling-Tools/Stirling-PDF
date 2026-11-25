package stirling.software.proprietary.connectedaccount;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ConnectedAccountRepository extends JpaRepository<ConnectedAccount, Long> {

    List<ConnectedAccount> findByOwnerUserIdOrderByCreatedAtAsc(Long ownerUserId);

    Optional<ConnectedAccount> findByOwnerUserIdAndProviderAndExternalId(
            Long ownerUserId, String provider, String externalId);

    void deleteByOwnerUserId(Long ownerUserId);
}
