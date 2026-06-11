package stirling.software.proprietary.policy.store;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import stirling.software.proprietary.policy.model.Policy;

/**
 * In-memory {@link PolicyStore} for tests and any future no-database mode. {@link JpaPolicyStore}
 * is the runtime bean.
 */
public class InProcessPolicyStore implements PolicyStore {

    private final Map<String, Policy> policies = new ConcurrentHashMap<>();

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
                        policy.sources(),
                        policy.steps(),
                        policy.output());
        policies.put(id, stored);
        return stored;
    }

    @Override
    public Optional<Policy> get(String id) {
        return Optional.ofNullable(policies.get(id));
    }

    @Override
    public List<Policy> all() {
        return List.copyOf(policies.values());
    }

    @Override
    public List<Policy> findByTriggerType(String triggerType) {
        return policies.values().stream()
                .filter(Policy::enabled)
                .filter(policy -> policy.trigger() != null)
                .filter(policy -> triggerType.equals(policy.trigger().type()))
                .toList();
    }

    @Override
    public boolean delete(String id) {
        return policies.remove(id) != null;
    }
}
