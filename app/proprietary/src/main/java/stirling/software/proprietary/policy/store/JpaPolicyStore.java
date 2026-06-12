package stirling.software.proprietary.policy.store;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.model.Policy;

import tools.jackson.databind.ObjectMapper;

/**
 * Durable {@link PolicyStore} backed by JPA. The runtime store whenever the proprietary module runs
 * (a datasource is always present). Policies are persisted as JSON via {@link PolicyEntity}; the
 * scalar columns are kept in sync for querying.
 */
@ApplicationScoped
@RequiredArgsConstructor
public class JpaPolicyStore implements PolicyStore {

    private final PolicyRepository repository;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
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
                        policy.sources(),
                        policy.steps(),
                        policy.output());

        PolicyEntity entity = new PolicyEntity();
        entity.setId(id);
        entity.setName(stored.name());
        entity.setOwner(stored.owner());
        entity.setEnabled(stored.enabled());
        entity.setTriggerType(stored.trigger() == null ? null : stored.trigger().type());
        entity.setPolicyJson(objectMapper.writeValueAsString(stored));
        repository.persist(entity);
        return stored;
    }

    @Override
    public Optional<Policy> get(String id) {
        return repository.findByIdOptional(id).map(this::toPolicy);
    }

    @Override
    public List<Policy> all() {
        return repository.listAll().stream().map(this::toPolicy).toList();
    }

    @Override
    public List<Policy> findByTriggerType(String triggerType) {
        return repository.findByTriggerTypeAndEnabledTrue(triggerType).stream()
                .map(this::toPolicy)
                .toList();
    }

    @Override
    @Transactional
    public boolean delete(String id) {
        return repository.deleteById(id);
    }

    private Policy toPolicy(PolicyEntity entity) {
        return objectMapper.readValue(entity.getPolicyJson(), Policy.class);
    }
}
