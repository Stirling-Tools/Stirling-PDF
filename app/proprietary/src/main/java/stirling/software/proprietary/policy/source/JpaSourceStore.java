package stirling.software.proprietary.policy.source;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import tools.jackson.databind.ObjectMapper;

/**
 * Durable {@link SourceStore} backed by JPA; the runtime store. Sources are persisted as JSON via
 * {@link SourceEntity}, with scalar columns kept in sync for querying.
 */
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class JpaSourceStore implements SourceStore {

    private final SourceRepository repository;
    private final ObjectMapper objectMapper;

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

        SourceEntity entity = new SourceEntity();
        entity.setId(id);
        entity.setName(stored.name());
        entity.setType(stored.type());
        entity.setOwner(stored.owner());
        entity.setTeamId(stored.teamId());
        entity.setEnabled(stored.enabled());
        entity.setSourceJson(objectMapper.writeValueAsString(stored));
        repository.save(entity);
        return stored;
    }

    @Override
    public Optional<Source> get(String id) {
        return repository.findById(id).map(this::toSource);
    }

    @Override
    public List<Source> all() {
        return repository.findAll().stream().map(this::toSource).toList();
    }

    @Override
    public List<Source> findByTeam(Long teamId) {
        return repository.findByTeam(teamId).stream().map(this::toSource).toList();
    }

    @Override
    public boolean delete(String id) {
        if (!repository.existsById(id)) {
            return false;
        }
        repository.deleteById(id);
        return true;
    }

    private Source toSource(SourceEntity entity) {
        return objectMapper.readValue(entity.getSourceJson(), Source.class);
    }
}
