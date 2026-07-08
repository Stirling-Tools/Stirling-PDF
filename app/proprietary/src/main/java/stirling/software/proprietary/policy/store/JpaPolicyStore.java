package stirling.software.proprietary.policy.store;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
        // Preserve an existing policy's run-order position; append a new one to the end of its
        // team's queue (max + 1), so setting up a policy adds it last by default.
        entity.setSortOrder(
                repository
                        .findById(id)
                        .map(PolicyEntity::getSortOrder)
                        .orElseGet(() -> nextSortOrder(stored.teamId())));
        entity.setPolicyJson(objectMapper.writeValueAsString(stored));
        repository.save(entity);
        return stored;
    }

    /**
     * Append position for a new policy: max(existing) + 1, computed under a pessimistic lock on the
     * team's rows (see {@link PolicyRepository#findByTeamForUpdate}) so two concurrent creates
     * can't both read the same max and assign a duplicate order. (A brand-new team has no rows to
     * lock; a rare simultaneous first-create there ties at 0 — harmless, since the ordering query
     * breaks ties by id and any later reorder normalises it.)
     */
    private int nextSortOrder(Long teamId) {
        return repository.findByTeamForUpdate(teamId).stream()
                        .map(entity -> entity.getSortOrder() == null ? 0 : entity.getSortOrder())
                        .max(Integer::compareTo)
                        .orElse(-1)
                + 1;
    }

    @Override
    @Transactional
    public void reorder(Long teamId, List<String> orderedIds) {
        int position = 0;
        for (String id : orderedIds) {
            PolicyEntity entity = repository.findById(id).orElse(null);
            // Ignore unknown ids and any policy outside the caller's team — a reorder can't reach
            // across teams.
            if (entity == null || !Objects.equals(entity.getTeamId(), teamId)) {
                continue;
            }
            entity.setSortOrder(position++);
            repository.save(entity);
        }
    }

    @Override
    public Optional<Policy> get(String id) {
        return repository.findById(id).map(this::toPolicy);
    }

    @Override
    public List<Policy> all() {
        return repository.findAllOrdered().stream().map(this::toPolicy).toList();
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
