package stirling.software.saas.payg.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.saas.payg.wallet.WalletPolicy;

public interface WalletPolicyRepository extends JpaRepository<WalletPolicy, Long> {

    Optional<WalletPolicy> findByTeamId(Long teamId);
}
