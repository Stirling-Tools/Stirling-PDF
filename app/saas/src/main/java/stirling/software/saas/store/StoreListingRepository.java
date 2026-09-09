package stirling.software.saas.store;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

/** Data access for {@link StoreListing}. Plain Spring Data JPA against {@code stirling_pdf}. */
public interface StoreListingRepository extends JpaRepository<StoreListing, Long> {

    Optional<StoreListing> findByStoreId(String storeId);

    boolean existsByStoreId(String storeId);

    /** Every listed row; the public catalogue filters, sorts and pages these in memory for now. */
    List<StoreListing> findByStatus(StoreListing.Status status);

    /** The team's own listings, listed and removed, newest publish first. */
    List<StoreListing> findByPublisherTeamIdOrderByPublishedAtDesc(Long publisherTeamId);

    List<StoreListing> findByIdIn(Collection<Long> ids);
}
