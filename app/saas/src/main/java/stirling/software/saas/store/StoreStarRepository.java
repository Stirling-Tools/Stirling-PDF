package stirling.software.saas.store;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

/** Data access for {@link StoreStar}. */
public interface StoreStarRepository extends JpaRepository<StoreStar, StoreStar.Key> {

    boolean existsByListingIdAndUserId(Long listingId, Long userId);

    @Transactional
    void deleteByListingIdAndUserId(Long listingId, Long userId);

    long countByListingId(Long listingId);

    /** Backs the viewer's Starred tab. */
    List<StoreStar> findByUserIdOrderByCreatedAtDesc(Long userId);

    /** Star state for a page of listings in one query. */
    List<StoreStar> findByUserIdAndListingIdIn(Long userId, List<Long> listingIds);
}
