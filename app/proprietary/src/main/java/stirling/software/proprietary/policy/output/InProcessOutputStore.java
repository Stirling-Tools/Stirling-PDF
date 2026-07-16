package stirling.software.proprietary.policy.output;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory {@link OutputStore} for tests and any future no-database mode. {@link JpaOutputStore}
 * is the runtime bean.
 */
public class InProcessOutputStore implements OutputStore {

    private final Map<String, Output> outputs = new ConcurrentHashMap<>();

    @Override
    public Output save(Output output) {
        String id =
                output.id() == null || output.id().isBlank()
                        ? UUID.randomUUID().toString()
                        : output.id();
        Output stored =
                new Output(
                        id,
                        output.name(),
                        output.type(),
                        output.options(),
                        output.enabled(),
                        output.owner(),
                        output.teamId());
        outputs.put(id, stored);
        return stored;
    }

    @Override
    public Optional<Output> get(String id) {
        return Optional.ofNullable(outputs.get(id));
    }

    @Override
    public List<Output> all() {
        return List.copyOf(outputs.values());
    }

    @Override
    public List<Output> findByTeam(Long teamId) {
        return outputs.values().stream()
                .filter(output -> Objects.equals(output.teamId(), teamId))
                .toList();
    }

    @Override
    public boolean delete(String id) {
        return outputs.remove(id) != null;
    }
}
