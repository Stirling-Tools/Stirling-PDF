package stirling.software.saas.store;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StoreInstallRepository extends JpaRepository<StoreInstall, Long> {

    boolean existsByListingIdAndTargetKindAndTargetId(
            Long listingId, StoreInstall.Target targetKind, Long targetId);

    long countByListingId(Long listingId);
}
