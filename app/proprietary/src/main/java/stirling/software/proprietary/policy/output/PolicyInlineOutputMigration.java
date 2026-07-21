package stirling.software.proprietary.policy.output;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * One-time, idempotent migration of policies' inline output destinations onto stored {@link Source}
 * references: policies written before a destination was a saved location carry their folder/S3
 * destination inline; this points each at a {@link Source} (reusing one at the same location, or
 * creating it) so the destination becomes a managed location like any other source. Policies with
 * an inline "return to caller" output have no location to store and are left as-is.
 *
 * <p>Idempotent by construction: a policy that already carries an {@code outputId} is skipped, so a
 * sequential re-run finds nothing to do. Matches are keyed by the write-relevant config within a
 * team, so an output to a folder/prefix an input source already covers links to that same source -
 * unifying the "output of A is the input of B" case onto one location. A concurrent multi-node boot
 * can at worst create a redundant (unreferenced) source row, never corrupt a policy.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PolicyInlineOutputMigration {

    // Destination types worth persisting as a location; "inline" has nothing to store.
    private static final List<String> DESTINATION_TYPES = List.of("folder", "s3");
    // The options that actually address a write destination, per type. Read-only options (e.g. a
    // folder's consume mode) are excluded so an output matches an existing input source at the same
    // place regardless of how that source reads.
    private static final Map<String, List<String>> ADDRESS_OPTIONS =
            Map.of("folder", List.of("directory"), "s3", List.of("connectionId", "prefix"));
    // Field separator for the dedup key: a unit-separator control char that cannot appear in a
    // directory/prefix/connection id, so distinct field sets can never collide.
    private static final char DELIMITER = '\u001f';

    private final PolicyStore policyStore;
    private final SourceStore sourceStore;

    // Runs after EmbeddedS3CredentialMigration (@Order(1)) so any legacy S3 output has already had
    // its embedded credentials extracted into a connection; the Source created here then references
    // that connection rather than copying credentials into source_json.
    @Order(2)
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void migrate() {
        Map<String, Source> byAddress = indexExistingSources();
        int migrated = 0;
        for (Policy policy : policyStore.all()) {
            if (!policy.outputIds().isEmpty()) {
                continue; // already references one or more locations
            }
            OutputSpec output = policy.output();
            if (output == null || !DESTINATION_TYPES.contains(output.type())) {
                continue; // inline / editor / no location to migrate
            }
            Source destination = destinationFor(policy, output, byAddress);
            policyStore.save(policy.withOutputIds(List.of(destination.id())));
            migrated++;
        }
        if (migrated > 0) {
            log.info("Linked {} policy output(s) to stored source locations", migrated);
        }
    }

    /** Reuses an existing team source at the same address, else creates a minimal one. */
    private Source destinationFor(Policy policy, OutputSpec spec, Map<String, Source> byAddress) {
        String key = addressKey(policy.teamId(), spec.type(), spec.options());
        Source existing = byAddress.get(key);
        if (existing != null) {
            return existing;
        }
        Source created =
                sourceStore.save(
                        new Source(
                                null,
                                destinationName(spec),
                                spec.type(),
                                spec.options(),
                                true,
                                policy.owner(),
                                policy.teamId()));
        byAddress.put(key, created);
        return created;
    }

    private Map<String, Source> indexExistingSources() {
        Map<String, Source> byKey = new LinkedHashMap<>();
        for (Source source : sourceStore.all()) {
            if (!DESTINATION_TYPES.contains(source.type())) {
                continue;
            }
            byKey.putIfAbsent(addressKey(source.teamId(), source.type(), source.options()), source);
        }
        return byKey;
    }

    private static String addressKey(Long teamId, String type, Map<String, Object> options) {
        StringBuilder key = new StringBuilder();
        key.append(teamId == null ? "" : teamId).append(DELIMITER);
        key.append(type == null ? "" : type).append(DELIMITER);
        for (String option : ADDRESS_OPTIONS.getOrDefault(type, List.of())) {
            Object value = options.get(option);
            key.append(value == null ? "" : value.toString()).append(DELIMITER);
        }
        return key.toString();
    }

    /** A readable default name derived from the destination; the user can rename it later. */
    private static String destinationName(OutputSpec spec) {
        if ("folder".equals(spec.type())) {
            Object directory = spec.options().get("directory");
            return directory == null ? "Folder" : "Folder: " + directory;
        }
        if ("s3".equals(spec.type())) {
            Object prefix = spec.options().get("prefix");
            return prefix == null || prefix.toString().isBlank() ? "S3 bucket" : "S3: " + prefix;
        }
        return spec.type();
    }
}
