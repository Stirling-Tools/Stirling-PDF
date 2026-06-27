package stirling.software.proprietary.policy.source;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory {@link SourceStore} for tests and any future no-database mode. {@link JpaSourceStore}
 * is the runtime bean.
 */
public class InProcessSourceStore implements SourceStore {

    private final Map<String, Source> sources = new ConcurrentHashMap<>();

    @Override
    public Source save(Source source) {
        String id =
                source.id() == null || source.id().isBlank()
                        ? UUID.randomUUID().toString()
                        : source.id();
        Source stored =
                new Source(
                        id,
                        source.name(),
                        source.type(),
                        source.options(),
                        source.enabled(),
                        source.owner(),
                        source.teamId());
        sources.put(id, stored);
        return stored;
    }

    @Override
    public Optional<Source> get(String id) {
        return Optional.ofNullable(sources.get(id));
    }

    @Override
    public List<Source> all() {
        return List.copyOf(sources.values());
    }

    @Override
    public List<Source> findByTeam(Long teamId) {
        return sources.values().stream()
                .filter(source -> Objects.equals(source.teamId(), teamId))
                .toList();
    }

    @Override
    public boolean delete(String id) {
        return sources.remove(id) != null;
    }
}
