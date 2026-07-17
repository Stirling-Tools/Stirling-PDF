package stirling.software.proprietary.policy.output;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * One-time, idempotent extraction of policies' inline output destinations into stored {@link
 * Output} records: policies written before outputs became a managed resource carry their folder/S3
 * destination inline on the policy; this creates (deduplicated, team-scoped) Output records for
 * them and rewrites each policy to reference its output by id. Policies with an inline "return to
 * caller" output have no destination to store and are left as-is (they keep returning results to
 * the caller).
 *
 * <p>Idempotent by construction: a policy that already carries an {@code outputId} is skipped, so
 * a sequential re-run finds nothing to do. Outputs are deduplicated within a team by their
 * type+config, so two policies writing to the same destination share one Output row. A concurrent
 * multi-node boot can at worst create a redundant (unreferenced) Output row, never corrupt a
 * policy - each node indexes existing outputs before writing, so overlapping runs may each mint
 * their own row for the same destination.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PolicyInlineOutputMigration {

    // Destination types worth persisting as an Output; "inline" has nothing to store.
    private static final List<String> DESTINATION_TYPES = List.of("folder", "s3");
    // Field separator for the dedup key: a unit-separator control char that cannot appear in a
    // directory/prefix/connection id, so distinct field sets can never collide.
    private static final char DELIMITER = '\u001f';

    private final PolicyStore policyStore;
    private final OutputStore outputStore;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void migrate() {
        Map<String, Output> byConfigKey = indexExistingOutputs();
        int migrated = 0;
        for (Policy policy : policyStore.all()) {
            if (policy.outputId() != null && !policy.outputId().isBlank()) {
                continue; // already references a saved output
            }
            OutputSpec output = policy.output();
            if (output == null || !DESTINATION_TYPES.contains(output.type())) {
                continue; // inline / editor / no destination to migrate
            }
            Output destination = outputFor(policy, output, byConfigKey);
            policyStore.save(policy.withOutputId(destination.id()));
            migrated++;
        }
        if (migrated > 0) {
            log.info("Linked {} policy output(s) to stored destinations", migrated);
        }
    }

    /** Reuses an existing team output with identical type+config, else creates one. */
    private Output outputFor(Policy policy, OutputSpec spec, Map<String, Output> byKey) {
        String key = configKey(policy.teamId(), spec.type(), spec.options());
        Output existing = byKey.get(key);
        if (existing != null) {
            return existing;
        }
        Output created =
                outputStore.save(
                        new Output(
                                null,
                                destinationName(spec),
                                spec.type(),
                                spec.options(),
                                true,
                                policy.owner(),
                                policy.teamId()));
        byKey.put(key, created);
        return created;
    }

    private Map<String, Output> indexExistingOutputs() {
        Map<String, Output> byKey = new LinkedHashMap<>();
        for (Output output : outputStore.all()) {
            byKey.putIfAbsent(configKey(output.teamId(), output.type(), output.options()), output);
        }
        return byKey;
    }

    private static String configKey(Long teamId, String type, Map<String, Object> options) {
        StringBuilder key = new StringBuilder();
        key.append(teamId == null ? "" : teamId).append(DELIMITER);
        key.append(type == null ? "" : type).append(DELIMITER);
        options.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(
                        entry ->
                                key.append(entry.getKey())
                                        .append('=')
                                        .append(Objects.toString(entry.getValue(), ""))
                                        .append(DELIMITER));
        return key.toString();
    }

    /** A readable default name derived from the destination; the user can rename it later. */
    private static String destinationName(OutputSpec spec) {
        if ("folder".equals(spec.type())) {
            Object directory = spec.options().get("directory");
            return directory == null ? "Folder output" : "Folder: " + directory;
        }
        if ("s3".equals(spec.type())) {
            Object prefix = spec.options().get("prefix");
            return prefix == null || prefix.toString().isBlank() ? "S3 output" : "S3: " + prefix;
        }
        return spec.type() + " output";
    }
}
