package stirling.software.proprietary.classification.store;

import java.time.Instant;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.classification.model.ClassificationTaxonomy;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * Durable {@link TaxonomyStore} backed by JPA; the runtime store. Gated on {@code policies.enabled}
 * — a team taxonomy only matters when the Classification policy can run — so it shares the policy
 * subsystem's on/off switch. The taxonomy is persisted as JSON via {@link TaxonomyEntity}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class JpaTaxonomyStore implements TaxonomyStore {

    private final TaxonomyRepository repository;
    private final ObjectMapper objectMapper;

    @Override
    public Optional<ClassificationTaxonomy> findByTeam(Long teamId) {
        Optional<TaxonomyEntity> entity = repository.findById(key(teamId));
        if (entity.isEmpty()) {
            return Optional.empty();
        }
        try {
            return Optional.of(
                    objectMapper.readValue(
                            entity.get().getTaxonomyJson(), ClassificationTaxonomy.class));
        } catch (JacksonException e) {
            // A stored taxonomy that no longer parses (corruption / manual DB edit) must not break
            // classification: drop it so the caller falls back to the built-in default rather than
            // surfacing a 500 on every upload for the team.
            log.warn(
                    "Discarding unparseable stored taxonomy for team {}: {}",
                    teamId,
                    e.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public ClassificationTaxonomy save(
            Long teamId, ClassificationTaxonomy taxonomy, String updatedBy) {
        TaxonomyEntity entity = new TaxonomyEntity();
        entity.setTeamId(key(teamId));
        entity.setTaxonomyJson(objectMapper.writeValueAsString(taxonomy));
        entity.setUpdatedAt(Instant.now());
        entity.setUpdatedBy(updatedBy);
        repository.save(entity);
        return taxonomy;
    }

    @Override
    public boolean deleteByTeam(Long teamId) {
        long id = key(teamId);
        if (!repository.existsById(id)) {
            return false;
        }
        repository.deleteById(id);
        return true;
    }

    /** Map the nullable team id onto the entity's non-null key (sentinel for the unteamed case). */
    private static long key(Long teamId) {
        return teamId == null ? TaxonomyEntity.NO_TEAM : teamId;
    }
}
