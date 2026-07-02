package stirling.software.proprietary.classification.store;

import java.util.Optional;

import stirling.software.proprietary.classification.model.ClassificationTaxonomy;

/**
 * Stores one {@link ClassificationTaxonomy} per team. A {@code null} teamId addresses the unteamed
 * taxonomy (login disabled / no resolvable team), mirroring how the policy store treats a null
 * team.
 */
public interface TaxonomyStore {

    /** The team's stored taxonomy, or empty when it has none (callers fall back to the default). */
    Optional<ClassificationTaxonomy> findByTeam(Long teamId);

    /** Create or replace the team's taxonomy. Returns the stored value. */
    ClassificationTaxonomy save(Long teamId, ClassificationTaxonomy taxonomy, String updatedBy);

    /** Remove the team's taxonomy (reset to default). Returns whether one existed. */
    boolean deleteByTeam(Long teamId);
}
