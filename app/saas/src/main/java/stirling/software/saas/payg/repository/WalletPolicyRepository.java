package stirling.software.saas.payg.repository;

import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.saas.payg.wallet.WalletPolicy;

@ApplicationScoped
public class WalletPolicyRepository implements PanacheRepositoryBase<WalletPolicy, Long> {

    public Optional<WalletPolicy> findByTeamId(Long teamId) {
        return find("teamId = ?1", teamId).firstResultOptional();
    }
}
