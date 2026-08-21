package stirling.software.saas.payg.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.saas.payg.wallet.WalletPolicy;

@Repository
public interface WalletPolicyRepository extends JpaRepository<WalletPolicy, Long> {

    Optional<WalletPolicy> findByTeamId(Long teamId);
}
