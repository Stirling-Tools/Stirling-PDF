package stirling.software.proprietary.policy.store;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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
    // Run-order position per policy id, mirroring JpaPolicyStore's sort_order column.
    private final Map<String, Integer> sortOrders = new ConcurrentHashMap<>();

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
        policies.put(id, stored);
        // Existing policy keeps its position; a new one appends to the end of its team's queue.
        sortOrders.computeIfAbsent(id, key -> nextSortOrder(stored.teamId()));
        return stored;
    }

    private int nextSortOrder(Long teamId) {
        return policies.values().stream()
                        .filter(policy -> Objects.equals(policy.teamId(), teamId))
                        .map(policy -> sortOrders.getOrDefault(policy.id(), 0))
                        .max(Comparator.naturalOrder())
                        .orElse(-1)
                + 1;
    }

    private Comparator<Policy> byRunOrder() {
        return Comparator.<Policy>comparingInt(policy -> sortOrders.getOrDefault(policy.id(), 0))
                .thenComparing(Policy::id);
    }

    @Override
    public Optional<Policy> get(String id) {
        return Optional.ofNullable(policies.get(id));
    }

    @Override
    public List<Policy> all() {
        return policies.values().stream().sorted(byRunOrder()).toList();
    }

    @Override
    public List<Policy> findByTeam(Long teamId) {
        return policies.values().stream()
                .filter(policy -> Objects.equals(policy.teamId(), teamId))
                .sorted(byRunOrder())
                .toList();
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
    public void reorder(Long teamId, List<String> orderedIds) {
        int position = 0;
        for (String id : orderedIds) {
            Policy policy = policies.get(id);
            if (policy == null || !Objects.equals(policy.teamId(), teamId)) {
                continue;
            }
            sortOrders.put(id, position++);
        }
    }

    @Override
    public boolean delete(String id) {
        sortOrders.remove(id);
        return policies.remove(id) != null;
    }
}
