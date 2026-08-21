package stirling.software.saas.payg.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.saas.payg.entitlement.WalletEntitlementSnapshot;
import stirling.software.saas.payg.entitlement.WalletEntitlementSnapshot.WalletEntitlementSnapshotId;

@Repository
public interface WalletEntitlementSnapshotRepository
        extends JpaRepository<WalletEntitlementSnapshot, WalletEntitlementSnapshotId> {

    /** Team-wide snapshot lookup. */
    default Optional<WalletEntitlementSnapshot> findTeamWide(Long teamId) {
        return findById(
                new WalletEntitlementSnapshotId(
                        teamId, WalletEntitlementSnapshot.TEAM_WIDE_USER_ID));
    }

    /** Per-member snapshot lookup. */
    default Optional<WalletEntitlementSnapshot> findForMember(Long teamId, Long userId) {
        return findById(new WalletEntitlementSnapshotId(teamId, userId));
    }
}
