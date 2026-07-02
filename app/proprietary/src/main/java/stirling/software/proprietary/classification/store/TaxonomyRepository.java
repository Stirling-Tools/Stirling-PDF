package stirling.software.proprietary.classification.store;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TaxonomyRepository extends JpaRepository<TaxonomyEntity, Long> {}
