package stirling.software.proprietary.classification.store;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import stirling.software.proprietary.classification.model.ClassificationTaxonomy;

/**
 * In-memory {@link TaxonomyStore} for tests and any future no-database mode. {@link
 * JpaTaxonomyStore} is the runtime bean.
 */
public class InProcessTaxonomyStore implements TaxonomyStore {

    private final Map<Long, ClassificationTaxonomy> byTeam = new ConcurrentHashMap<>();

    @Override
    public Optional<ClassificationTaxonomy> findByTeam(Long teamId) {
        return Optional.ofNullable(byTeam.get(key(teamId)));
    }

    @Override
    public ClassificationTaxonomy save(
            Long teamId, ClassificationTaxonomy taxonomy, String updatedBy) {
        byTeam.put(key(teamId), taxonomy);
        return taxonomy;
    }

    @Override
    public boolean deleteByTeam(Long teamId) {
        return byTeam.remove(key(teamId)) != null;
    }

    private static long key(Long teamId) {
        return teamId == null ? TaxonomyEntity.NO_TEAM : teamId;
    }
}
