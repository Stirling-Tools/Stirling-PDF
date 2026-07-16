package stirling.software.proprietary.policy.output;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import tools.jackson.databind.ObjectMapper;

/**
 * Durable {@link OutputStore} backed by JPA; the runtime store. Outputs are persisted as JSON via
 * {@link OutputEntity}, with scalar columns kept in sync for querying.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JpaOutputStore implements OutputStore {

    private final OutputRepository repository;
    private final ObjectMapper objectMapper;

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

        OutputEntity entity = new OutputEntity();
        entity.setId(id);
        entity.setName(stored.name());
        entity.setType(stored.type());
        entity.setOwner(stored.owner());
        entity.setTeamId(stored.teamId());
        entity.setEnabled(stored.enabled());
        entity.setOutputJson(objectMapper.writeValueAsString(stored));
        repository.save(entity);
        return stored;
    }

    @Override
    public Optional<Output> get(String id) {
        return repository.findById(id).flatMap(this::toOutput);
    }

    @Override
    public List<Output> all() {
        return repository.findAll().stream().map(this::toOutput).flatMap(Optional::stream).toList();
    }

    @Override
    public List<Output> findByTeam(Long teamId) {
        return repository.findByTeam(teamId).stream()
                .map(this::toOutput)
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
    private Optional<Output> toOutput(OutputEntity entity) {
        try {
            return Optional.of(objectMapper.readValue(entity.getOutputJson(), Output.class));
        } catch (Exception e) {
            log.error(
                    "Skipping unreadable policy output id={} name={}: stored JSON could not be"
                            + " parsed ({}). Likely written by a different app version or"
                            + " encryption key.",
                    entity.getId(),
                    entity.getName(),
                    e.getMessage());
            return Optional.empty();
        }
    }
}
