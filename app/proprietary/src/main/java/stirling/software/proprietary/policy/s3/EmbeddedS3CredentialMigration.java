package stirling.software.proprietary.policy.s3;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.access.model.DefaultAccessPolicy;
import stirling.software.proprietary.access.model.OwnerScope;
import stirling.software.proprietary.integration.model.IntegrationConfig;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.security.repository.TeamRepository;

import tools.jackson.databind.ObjectMapper;

/**
 * One-time, idempotent extraction of legacy embedded S3 credentials into stored connections:
 * sources and policy outputs written before connections shipped carry bucket/credentials in their
 * own options; this rewrites each to reference a (deduplicated) S3 {@link IntegrationConfig} and
 * keeps only per-use options (prefix, mode). MUST be programmatic - it parses and rewrites the
 * option JSON (and decrypts any legacy ciphertext row on read), which no SQL migration can do.
 *
 * <p>Idempotent by construction: rewritten rows no longer embed credentials, so re-runs find
 * nothing to do. Connections are deduplicated against both this run's extractions and existing S3
 * connections; a concurrent multi-node boot can at worst create a redundant connection row, never
 * corrupt a source. Ownership follows the owning row: team-scoped when the source/policy has a
 * team, server-scoped otherwise (single-operator self-hosted).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EmbeddedS3CredentialMigration {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final List<String> CONNECTION_OPTIONS =
            List.of("bucket", "region", "endpoint", "accessKeyId", "secretAccessKey");
    // Field separator for the dedup key: a unit-separator control char that cannot appear in a
    // bucket/region/endpoint/credential, so distinct field sets can never collide.
    private static final char DELIMITER = '\u001f';

    private final SourceStore sourceStore;
    private final PolicyStore policyStore;
    private final IntegrationConfigRepository connections;
    private final TeamRepository teamRepository;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void migrate() {
        Map<String, IntegrationConfig> byCredentialKey = indexExistingConnections();
        int migrated = 0;
        for (Source source : sourceStore.all()) {
            if (!"s3".equals(source.type()) || !embedsCredentials(source.options())) {
                continue;
            }
            IntegrationConfig connection =
                    connectionFor(source.options(), source.teamId(), byCredentialKey);
            sourceStore.save(withOptions(source, referencing(connection, source.options(), true)));
            migrated++;
        }
        for (Policy policy : policyStore.all()) {
            OutputSpec output = policy.output();
            if (!"s3".equals(output.type()) || !embedsCredentials(output.options())) {
                continue;
            }
            IntegrationConfig connection =
                    connectionFor(output.options(), policy.teamId(), byCredentialKey);
            policyStore.save(
                    withOutput(
                            policy,
                            new OutputSpec(
                                    output.type(),
                                    referencing(connection, output.options(), false))));
            migrated++;
        }
        if (migrated > 0) {
            log.info("Extracted embedded S3 credentials from {} row(s) into connections", migrated);
        }
    }

    private static boolean embedsCredentials(Map<String, Object> options) {
        return options.get("accessKeyId") != null;
    }

    /** Reuses an existing connection with identical coordinates+credentials, else creates one. */
    private IntegrationConfig connectionFor(
            Map<String, Object> options, Long teamId, Map<String, IntegrationConfig> byKey) {
        String key = credentialKey(options);
        IntegrationConfig existing = byKey.get(key);
        if (existing != null) {
            return existing;
        }
        IntegrationConfig connection = new IntegrationConfig();
        connection.setIntegrationType(IntegrationType.S3);
        connection.setName(connectionName(options, byKey));
        connection.setEnabled(true);
        connection.setLocked(false);
        connection.setDefaultAccess(DefaultAccessPolicy.EXPLICIT_ONLY);
        Team team = teamId == null ? null : teamRepository.findById(teamId).orElse(null);
        if (team != null) {
            connection.setScope(OwnerScope.TEAM);
            connection.setOwnerTeam(team);
        } else {
            // No team (teamless self-hosted, or a source whose team was since deleted): server
            // scope, i.e. admin-owned. An orphaned-team source's non-admin editor would then need
            // an admin to re-share the connection - acceptable for the narrow orphaned case.
            connection.setScope(OwnerScope.SERVER);
        }
        Map<String, Object> config = new LinkedHashMap<>();
        for (String option : CONNECTION_OPTIONS) {
            Object value = options.get(option);
            if (value != null && !value.toString().isBlank()) {
                config.put(option, value);
            }
        }
        connection.setConfig(OBJECT_MAPPER.writeValueAsString(config));
        IntegrationConfig saved = connections.save(connection);
        byKey.put(key, saved);
        return saved;
    }

    /** The rewritten options: the connection reference plus per-use settings only. */
    private static Map<String, Object> referencing(
            IntegrationConfig connection, Map<String, Object> legacy, boolean keepMode) {
        Map<String, Object> options = new LinkedHashMap<>();
        options.put(S3ConnectionResolver.CONNECTION_ID_OPTION, connection.getId());
        Object prefix = legacy.get("prefix");
        if (prefix != null && !prefix.toString().isBlank()) {
            options.put("prefix", prefix);
        }
        Object mode = legacy.get("mode");
        if (keepMode && mode != null && !mode.toString().isBlank()) {
            options.put("mode", mode);
        }
        return options;
    }

    private Map<String, IntegrationConfig> indexExistingConnections() {
        Map<String, IntegrationConfig> byKey = new LinkedHashMap<>();
        for (IntegrationConfig connection : connections.findAll()) {
            if (connection.getIntegrationType() != IntegrationType.S3) {
                continue;
            }
            try {
                Map<String, Object> config =
                        OBJECT_MAPPER.readValue(connection.getConfig(), Map.class);
                byKey.putIfAbsent(credentialKey(config), connection);
            } catch (Exception e) {
                log.debug(
                        "Skipping unreadable S3 connection {} while indexing: {}",
                        connection.getId(),
                        e.getMessage());
            }
        }
        return byKey;
    }

    private static String credentialKey(Map<String, Object> options) {
        StringBuilder key = new StringBuilder();
        for (String option : CONNECTION_OPTIONS) {
            Object value = options.get(option);
            key.append(value == null ? "" : value.toString().trim()).append(DELIMITER);
        }
        return key.toString();
    }

    private static String connectionName(
            Map<String, Object> options, Map<String, IntegrationConfig> byKey) {
        String base = "S3: " + options.getOrDefault("bucket", "bucket");
        long sameName = byKey.values().stream().filter(c -> c.getName().startsWith(base)).count();
        return sameName == 0 ? base : base + " (" + (sameName + 1) + ")";
    }

    private static Source withOptions(Source source, Map<String, Object> options) {
        return new Source(
                source.id(),
                source.name(),
                source.type(),
                options,
                source.enabled(),
                source.owner(),
                source.teamId());
    }

    private static Policy withOutput(Policy policy, OutputSpec output) {
        return new Policy(
                policy.id(),
                policy.name(),
                policy.owner(),
                policy.enabled(),
                policy.trigger(),
                policy.sourceIds(),
                policy.steps(),
                output,
                policy.teamId());
    }
}
