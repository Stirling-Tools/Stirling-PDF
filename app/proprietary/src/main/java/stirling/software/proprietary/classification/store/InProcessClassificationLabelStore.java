package stirling.software.proprietary.classification.store;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import stirling.software.proprietary.classification.model.ClassificationLabels;

/**
 * In-memory {@link ClassificationLabelStore} for tests and any future no-database mode. {@link
 * JpaClassificationLabelStore} is the runtime bean.
 */
public class InProcessClassificationLabelStore implements ClassificationLabelStore {

    private final Map<Long, ClassificationLabels> byTeam = new ConcurrentHashMap<>();

    @Override
    public Optional<ClassificationLabels> findByTeam(Long teamId) {
        return Optional.ofNullable(byTeam.get(key(teamId)));
    }

    @Override
    public ClassificationLabels save(Long teamId, ClassificationLabels labels, String updatedBy) {
        byTeam.put(key(teamId), labels);
        return labels;
    }

    @Override
    public boolean deleteByTeam(Long teamId) {
        return byTeam.remove(key(teamId)) != null;
    }

    private static long key(Long teamId) {
        return teamId == null ? TeamLabelsEntity.NO_TEAM : teamId;
    }
}
