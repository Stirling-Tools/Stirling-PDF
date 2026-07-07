package stirling.software.proprietary.classification.store;

import java.util.Optional;

import stirling.software.proprietary.classification.model.ClassificationLabels;

/**
 * Stores one {@link ClassificationLabels} set per team. A {@code null} teamId addresses the
 * unteamed set (login disabled / no resolvable team), mirroring how the policy store treats a null
 * team.
 */
public interface ClassificationLabelStore {

    /** The team's stored labels, or empty when it has none (callers fall back to the default). */
    Optional<ClassificationLabels> findByTeam(Long teamId);

    /** Create or replace the team's labels. Returns the stored value. */
    ClassificationLabels save(Long teamId, ClassificationLabels labels, String updatedBy);

    /** Remove the team's labels (reset to default). Returns whether a set existed. */
    boolean deleteByTeam(Long teamId);
}
