package stirling.software.saas.payg.repository;

import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.saas.payg.entitlement.WalletEntitlementSnapshot;
import stirling.software.saas.payg.entitlement.WalletEntitlementSnapshot.WalletEntitlementSnapshotId;

@ApplicationScoped
public class WalletEntitlementSnapshotRepository
        implements PanacheRepositoryBase<WalletEntitlementSnapshot, WalletEntitlementSnapshotId> {

    /** Team-wide snapshot lookup. */
    public Optional<WalletEntitlementSnapshot> findTeamWide(Long teamId) {
        return findByIdOptional(
                new WalletEntitlementSnapshotId(
                        teamId, WalletEntitlementSnapshot.TEAM_WIDE_USER_ID));
    }

    /** Per-member snapshot lookup. */
    public Optional<WalletEntitlementSnapshot> findForMember(Long teamId, Long userId) {
        return findByIdOptional(new WalletEntitlementSnapshotId(teamId, userId));
    }
}
