package stirling.software.proprietary.cluster.valkey;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.quarkus.redis.datasource.RedisDataSource;
import io.quarkus.redis.datasource.hash.HashCommands;
import io.quarkus.redis.datasource.keys.KeyCommands;
import io.quarkus.redis.datasource.keys.KeyScanArgs;
import io.quarkus.redis.datasource.keys.KeyScanCursor;
import io.quarkus.redis.datasource.transactions.OptimisticLockingTransactionResult;
import io.quarkus.redis.datasource.value.SetArgs;
import io.quarkus.redis.datasource.value.ValueCommands;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.JobStore;
import stirling.software.common.cluster.JobStoreEntry;

/**
 * Valkey-backed {@link JobStore}. Each job is one hash; a reverse index maps fileId to jobId.
 *
 * <p><b>put() atomicity:</b> the hash fields, the per-job TTL, and the reverse-index entries are
 * issued inside a single Redis transaction (MULTI/EXEC). A partial failure cannot leave the hash
 * without a TTL or with half the file->job index entries written.
 */
// TODO: Migration required - @ConditionalOnValkeyBackplane (Spring @ConditionalOnExpression) is a
// runtime toggle on cluster.enabled + cluster.backplane=valkey. Quarkus has no direct equivalent
// for the composite expression; either reimplement ConditionalOnValkeyBackplane as a Quarkus
// build-time condition (@io.quarkus.arc.profile.IfBuildProfile /
// @io.quarkus.arc.lookup.LookupIfProperty) or guard bean activation at runtime. Annotation left in
// place pending that collaborator change.
@ApplicationScoped
@ConditionalOnValkeyBackplane
@Slf4j
public class ValkeyJobStore implements JobStore {

    private static final String JOB_PREFIX = "stirling:job:";
    private static final String FILE_INDEX_PREFIX = "stirling:file2job:";

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<String>> LIST_STRING = new TypeReference<>() {};
    private static final TypeReference<Map<String, String>> MAP_STRING = new TypeReference<>() {};

    // String-keyed, byte-valued command groups mirror the original byte-level access so JSON
    // payloads and ids round-trip exactly as they did via StringRedisTemplate's byte commands.
    private final RedisDataSource redis;
    private final HashCommands<String, String, byte[]> hash;
    private final ValueCommands<String, byte[]> value;
    private final KeyCommands<String> keys;
    private final ValueCommands<String, String> stringValue;

    public ValkeyJobStore(RedisDataSource redis) {
        this.redis = redis;
        this.hash = redis.hash(String.class, String.class, byte[].class);
        this.value = redis.value(String.class, byte[].class);
        this.keys = redis.key(String.class);
        this.stringValue = redis.value(String.class, String.class);
    }

    @Override
    public void put(JobStoreEntry entry, Duration ttl) {
        String key = JOB_PREFIX + entry.jobId();
        long ttlMs = ttl.toMillis();
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("jobId", entry.jobId());
        fields.put("state", entry.state().name());
        fields.put("owningNodeId", entry.owningNodeId() == null ? "" : entry.owningNodeId());
        if (entry.createdAt() != null) {
            fields.put("createdAt", entry.createdAt().toString());
        }
        if (entry.completedAt() != null) {
            fields.put("completedAt", entry.completedAt().toString());
        }
        if (entry.error() != null) {
            fields.put("error", entry.error());
        }
        fields.put("fileIds", writeJson(entry.fileIds() == null ? List.of() : entry.fileIds()));
        fields.put(
                "resultMeta",
                writeJson(entry.resultMeta() == null ? Map.of() : entry.resultMeta()));

        Map<String, byte[]> hashBytes = new LinkedHashMap<>();
        for (Map.Entry<String, String> f : fields.entrySet()) {
            hashBytes.put(f.getKey(), f.getValue().getBytes(StandardCharsets.UTF_8));
        }

        // Build MULTI/EXEC so the hash, its TTL, and every reverse-index entry commit atomically.
        // Quarkus' withTransaction enqueues commands issued on the transactional datasource between
        // MULTI and EXEC. SetArgs.px(ttl) sets the value-with-TTL in one SET (the original issued a
        // separate pExpire after SET); pexpire keeps the original two-step shape for the hash.
        redis.withTransaction(
                tx -> {
                    tx.hash(String.class, String.class, byte[].class).hset(key, hashBytes);
                    tx.key(String.class).pexpire(key, ttlMs);
                    if (entry.fileIds() != null) {
                        for (String fileId : entry.fileIds()) {
                            String idxKey = FILE_INDEX_PREFIX + fileId;
                            tx.value(String.class, byte[].class)
                                    .set(
                                            idxKey,
                                            entry.jobId().getBytes(StandardCharsets.UTF_8),
                                            new SetArgs().px(ttlMs));
                        }
                    }
                });
    }

    @Override
    public Optional<JobStoreEntry> get(String jobId) {
        return readEntry(JOB_PREFIX + jobId);
    }

    @Override
    public void delete(String jobId) {
        // WATCH/MULTI/EXEC: read fileIds INSIDE the watched scope so a concurrent put() that
        // adds new fileIds between our read and EXEC aborts the transaction. Without this guard,
        // an interleaved put() that grows fileIds would leave orphaned reverse-index entries
        // pointing at the deleted jobId until their TTL expires. One retry handles the common
        // case; further contention falls through to lazy TTL cleanup (acceptable - this is an
        // eviction path, not a correctness primitive).
        String jobKey = JOB_PREFIX + jobId;
        for (int attempt = 0; attempt < 2; attempt++) {
            // withTransaction(preTxBlock, watchedKeys...): the preTxBlock runs after WATCH and
            // before MULTI; its result feeds the transactional block. If a watched key changes
            // before EXEC, Quarkus aborts and the result reports discarded() == true.
            // withTransaction(preTxBlock, biConsumer, watchedKeys): preTxBlock result I is
            // passed as the first arg to the BiConsumer along with the transactional datasource.
            OptimisticLockingTransactionResult<List<String>> result =
                    redis.withTransaction(
                            (io.quarkus.redis.datasource.RedisDataSource ds) -> {
                                byte[] fileIdsBytes =
                                        ds.hash(String.class, String.class, byte[].class)
                                                .hget(jobKey, "fileIds");
                                if (fileIdsBytes == null) {
                                    return List.<String>of();
                                }
                                return readJsonList(
                                        new String(fileIdsBytes, StandardCharsets.UTF_8), jobKey);
                            },
                            (List<String> fileIds,
                                    io.quarkus.redis.datasource.transactions
                                                    .TransactionalRedisDataSource
                                            tx) -> {
                                List<String> keysToDelete = new ArrayList<>();
                                keysToDelete.add(jobKey);
                                for (String fileId : fileIds) {
                                    keysToDelete.add(FILE_INDEX_PREFIX + fileId);
                                }
                                tx.key(String.class).del(keysToDelete.toArray(new String[0]));
                            },
                            jobKey);
            // EXEC returns discarded when WATCH detected a concurrent write.
            if (!result.discarded()) {
                return;
            }
        }
        log.warn(
                "JobStore.delete({}) lost two WATCH races to concurrent put(); reverse-index"
                        + " entries may linger until TTL expiry",
                jobId);
    }

    @Override
    public boolean exists(String jobId) {
        return keys.exists(JOB_PREFIX + jobId);
    }

    @Override
    public Optional<String> findJobIdByFileId(String fileId) {
        return Optional.ofNullable(stringValue.get(FILE_INDEX_PREFIX + fileId));
    }

    @Override
    public Collection<JobStoreEntry> all() {
        // SCAN, not KEYS - KEYS blocks the Valkey server for the duration of the walk.
        KeyScanCursor<String> cursor =
                keys.scan(new KeyScanArgs().match(JOB_PREFIX + "*").count(256));
        List<JobStoreEntry> result = new ArrayList<>();
        while (cursor.hasNext()) {
            for (String key : cursor.next()) {
                readEntry(key).ifPresent(result::add);
            }
        }
        return result;
    }

    private Optional<JobStoreEntry> readEntry(String key) {
        Map<String, byte[]> raw = hash.hgetall(key);
        if (raw == null || raw.isEmpty()) {
            return Optional.empty();
        }
        Map<String, String> entries = new HashMap<>();
        for (Map.Entry<String, byte[]> e : raw.entrySet()) {
            entries.put(
                    e.getKey(),
                    e.getValue() == null ? null : new String(e.getValue(), StandardCharsets.UTF_8));
        }
        String jobId = entries.get("jobId");
        if (jobId == null) {
            return Optional.empty();
        }
        Instant createdAt = parseInstant(entries.get("createdAt"), key, "createdAt");
        Instant completedAt = parseInstant(entries.get("completedAt"), key, "completedAt");
        List<String> fileIds = parseList(entries.get("fileIds"), key);
        Map<String, String> resultMeta = parseMap(entries.get("resultMeta"), key);
        String stateName =
                String.valueOf(
                        entries.getOrDefault("state", JobStoreEntry.JobState.PENDING.name()));
        JobStoreEntry.JobState state;
        try {
            state = JobStoreEntry.JobState.valueOf(stateName);
        } catch (IllegalArgumentException ex) {
            log.warn("Unrecognised job state '{}' in {}, defaulting to PENDING", stateName, key);
            state = JobStoreEntry.JobState.PENDING;
        }
        String owningNodeId = String.valueOf(entries.getOrDefault("owningNodeId", ""));
        String error = entries.get("error") == null ? null : entries.get("error");
        return Optional.of(
                new JobStoreEntry(
                        jobId,
                        state,
                        owningNodeId,
                        createdAt,
                        completedAt,
                        error,
                        fileIds,
                        resultMeta));
    }

    private Instant parseInstant(Object v, String key, String field) {
        if (v == null) {
            return null;
        }
        try {
            return Instant.parse(v.toString());
        } catch (RuntimeException e) {
            log.warn(
                    "JobStore {} field '{}' has malformed timestamp '{}' - treating as missing",
                    key,
                    field,
                    v);
            return null;
        }
    }

    private List<String> parseList(Object v, String key) {
        if (v == null) {
            return new ArrayList<>();
        }
        return readJsonList(v.toString(), key);
    }

    private Map<String, String> parseMap(Object v, String key) {
        if (v == null) {
            return new HashMap<>();
        }
        try {
            return MAPPER.readValue(v.toString(), MAP_STRING);
        } catch (JsonProcessingException e) {
            log.warn(
                    "JobStore {} field 'resultMeta' is not valid JSON '{}' - treating as empty",
                    key,
                    v);
            return new HashMap<>();
        }
    }

    private static String writeJson(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to JSON-serialize JobStore field", e);
        }
    }

    private List<String> readJsonList(String json, String key) {
        try {
            List<String> parsed = MAPPER.readValue(json, LIST_STRING);
            return parsed == null ? new ArrayList<>() : parsed;
        } catch (JsonProcessingException e) {
            log.warn(
                    "JobStore {} field 'fileIds' is not valid JSON '{}' - treating as empty",
                    key,
                    json);
            return new ArrayList<>();
        }
    }
}
