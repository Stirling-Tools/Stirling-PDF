package stirling.software.proprietary.classification.store;

import java.time.Instant;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.classification.model.ClassificationLabels;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * Durable {@link ClassificationLabelStore} backed by JPA; the runtime store. Gated on {@code
 * policies.enabled} — stored labels only matter when the Classification policy can run — so it
 * shares the policy subsystem's on/off switch. Each label set is persisted as JSON via {@link
 * TeamLabelsEntity}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class JpaClassificationLabelStore implements ClassificationLabelStore {

    private final TeamLabelsRepository teamRepository;
    private final ObjectMapper objectMapper;

    @Override
    public Optional<ClassificationLabels> findByTeam(Long teamId) {
        return teamRepository
                .findById(key(teamId))
                .flatMap(entity -> parse(entity.getLabelsJson(), "team " + teamId));
    }

    @Override
    public ClassificationLabels save(Long teamId, ClassificationLabels labels, String updatedBy) {
        TeamLabelsEntity entity = new TeamLabelsEntity();
        entity.setTeamId(key(teamId));
        entity.setLabelsJson(objectMapper.writeValueAsString(labels));
        entity.setUpdatedAt(Instant.now());
        entity.setUpdatedBy(updatedBy);
        teamRepository.save(entity);
        return labels;
    }

    @Override
    public boolean deleteByTeam(Long teamId) {
        long id = key(teamId);
        if (!teamRepository.existsById(id)) {
            return false;
        }
        teamRepository.deleteById(id);
        return true;
    }

    private Optional<ClassificationLabels> parse(String json, String owner) {
        try {
            return Optional.of(objectMapper.readValue(json, ClassificationLabels.class));
        } catch (JacksonException e) {
            // A stored label set that no longer parses (corruption / manual DB edit) must not break
            // classification: drop it so the caller treats the team as having no labels (and skips
            // classification) rather than surfacing a 500 on every upload.
            log.warn("Discarding unparseable stored labels for {}: {}", owner, e.getMessage());
            return Optional.empty();
        }
    }

    /** Map the nullable team id onto the entity's non-null key (sentinel for the unteamed case). */
    private static long key(Long teamId) {
        return teamId == null ? TeamLabelsEntity.NO_TEAM : teamId;
    }
}
