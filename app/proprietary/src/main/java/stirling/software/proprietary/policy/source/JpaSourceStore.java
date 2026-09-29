package stirling.software.proprietary.policy.source;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import tools.jackson.databind.ObjectMapper;

/**
 * Durable {@link SourceStore} backed by JPA; the runtime store. Sources are persisted as JSON via
 * {@link SourceEntity}, with scalar columns kept in sync for querying.
 */
@Slf4j
@Service
@RequiredArgsConstructor
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
        return repository.findById(id).flatMap(this::toSource);
    }

    @Override
    public List<Source> all() {
        return repository.findAll().stream().map(this::toSource).flatMap(Optional::stream).toList();
    }

    @Override
    public List<Source> findByTeam(Long teamId) {
        return repository.findByTeam(teamId).stream()
                .map(this::toSource)
                .flatMap(Optional::stream)
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

    // Skip (don't fail) rows whose JSON can't be read - e.g. written by another app version/key.
    // One unreadable row must never abort a bulk read or crash startup.
    private Optional<Source> toSource(SourceEntity entity) {
        try {
            return Optional.of(objectMapper.readValue(entity.getSourceJson(), Source.class));
        } catch (Exception e) {
            log.error(
                    "Skipping unreadable policy source id={} name={}: stored JSON could not be"
                            + " parsed ({}). Likely written by a different app version or"
                            + " encryption key.",
                    entity.getId(),
                    entity.getName(),
                    e.getMessage());
            return Optional.empty();
        }
    }
}
