package stirling.software.proprietary.policy.store;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.model.Policy;

import tools.jackson.databind.ObjectMapper;

/**
 * Durable {@link PolicyStore} backed by JPA; the runtime store. Policies are persisted as JSON via
 * {@link PolicyEntity}, with scalar columns kept in sync for querying.
 */
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class JpaPolicyStore implements PolicyStore {

    private final PolicyRepository repository;
    private final ObjectMapper objectMapper;

    @Override
    public Policy save(Policy policy) {
        String id =
                policy.id() == null || policy.id().isBlank()
                        ? UUID.randomUUID().toString()
                        : policy.id();
        Policy stored =
                new Policy(
                        id,
                        policy.name(),
                        policy.owner(),
                        policy.enabled(),
                        policy.trigger(),
                        policy.sourceIds(),
                        policy.steps(),
                        policy.output(),
                        policy.teamId());

        PolicyEntity entity = new PolicyEntity();
        entity.setId(id);
        entity.setName(stored.name());
        entity.setOwner(stored.owner());
        entity.setEnabled(stored.enabled());
        entity.setTriggerType(stored.trigger() == null ? null : stored.trigger().type());
        entity.setTeamId(stored.teamId());
        entity.setPolicyJson(objectMapper.writeValueAsString(stored));
        repository.save(entity);
        return stored;
    }

    @Override
    public Optional<Policy> get(String id) {
        return repository.findById(id).map(this::toPolicy);
    }

    @Override
    public List<Policy> all() {
        return repository.findAll().stream().map(this::toPolicy).toList();
    }

    @Override
    public List<Policy> findByTeam(Long teamId) {
        return repository.findByTeam(teamId).stream().map(this::toPolicy).toList();
    }

    @Override
    public List<Policy> findByTriggerType(String triggerType) {
        return repository.findByTriggerTypeAndEnabledTrue(triggerType).stream()
                .map(this::toPolicy)
                .toList();
    }

    @Override
    public boolean delete(String id) {
        if (!repository.existsById(id)) {
            return false;
        }
        repository.deleteById(id);
        return true;
    }

    private Policy toPolicy(PolicyEntity entity) {
        return objectMapper.readValue(entity.getPolicyJson(), Policy.class);
    }
}
