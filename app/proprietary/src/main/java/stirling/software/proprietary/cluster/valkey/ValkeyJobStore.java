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

import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.JobStore;
import stirling.software.common.cluster.JobStoreEntry;

/**
 * Valkey-backed {@link JobStore}. Each job is one hash; a reverse index maps fileId to jobId.
 *
 * <p><b>put() atomicity:</b> the hash fields, the per-job TTL, and the reverse-index entries are
 * issued inside a single pipelined Redis transaction (MULTI/EXEC). A partial failure cannot leave
 * the hash without a TTL or with half the file→job index entries written.
 */
@Component
@RequiredArgsConstructor
@ConditionalOnValkeyBackplane
@Slf4j
public class ValkeyJobStore implements JobStore {

    private static final String JOB_PREFIX = "stirling:job:";
    private static final String FILE_INDEX_PREFIX = "stirling:file2job:";

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<String>> LIST_STRING = new TypeReference<>() {};
    private static final TypeReference<Map<String, String>> MAP_STRING = new TypeReference<>() {};

    private final StringRedisTemplate template;

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

        // Build pipelined MULTI/EXEC so the hash, its TTL, and every reverse-index entry
        // commit atomically.
        template.execute(
                (RedisCallback<Object>)
                        connection -> {
                            connection.multi();
                            byte[] keyBytes = key.getBytes(StandardCharsets.UTF_8);
                            Map<byte[], byte[]> hashBytes = new LinkedHashMap<>();
                            for (Map.Entry<String, String> f : fields.entrySet()) {
                                hashBytes.put(
                                        f.getKey().getBytes(StandardCharsets.UTF_8),
                                        f.getValue().getBytes(StandardCharsets.UTF_8));
                            }
                            connection.hashCommands().hMSet(keyBytes, hashBytes);
                            connection.keyCommands().pExpire(keyBytes, ttlMs);
                            if (entry.fileIds() != null) {
                                for (String fileId : entry.fileIds()) {
                                    byte[] idxKey =
                                            (FILE_INDEX_PREFIX + fileId)
                                                    .getBytes(StandardCharsets.UTF_8);
                                    connection
                                            .stringCommands()
                                            .set(
                                                    idxKey,
                                                    entry.jobId().getBytes(StandardCharsets.UTF_8));
                                    connection.keyCommands().pExpire(idxKey, ttlMs);
                                }
                            }
                            connection.exec();
                            return null;
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
        byte[] jobKeyBytes = jobKey.getBytes(StandardCharsets.UTF_8);
        for (int attempt = 0; attempt < 2; attempt++) {
            Boolean committed =
                    template.execute(
                            (RedisCallback<Boolean>)
                                    connection -> {
                                        connection.watch(jobKeyBytes);
                                        // Read the single fileIds field with hGet rather than
                                        // hGetAll + map.get: hGetAll returns a Map<byte[],byte[]>
                                        // whose keys compare by identity, so a fresh
                                        // "fileIds".getBytes() lookup never matches and the reverse
                                        // index would be left orphaned. hGet resolves the field
                                        // server-side.
                                        byte[] fileIdsBytes =
                                                connection
                                                        .hashCommands()
                                                        .hGet(
                                                                jobKeyBytes,
                                                                "fileIds"
                                                                        .getBytes(
                                                                                StandardCharsets
                                                                                        .UTF_8));
                                        List<byte[]> keysToDelete = new ArrayList<>();
                                        keysToDelete.add(jobKeyBytes);
                                        if (fileIdsBytes != null) {
                                            List<String> fileIds =
                                                    readJsonList(
                                                            new String(
                                                                    fileIdsBytes,
                                                                    StandardCharsets.UTF_8),
                                                            jobKey);
                                            for (String fileId : fileIds) {
                                                keysToDelete.add(
                                                        (FILE_INDEX_PREFIX + fileId)
                                                                .getBytes(StandardCharsets.UTF_8));
                                            }
                                        }
                                        connection.multi();
                                        for (byte[] key : keysToDelete) {
                                            connection.keyCommands().del(key);
                                        }
                                        List<Object> results = connection.exec();
                                        // exec() returns null when WATCH detected a concurrent
                                        // write; spring-data-redis surfaces this as either null
                                        // or empty depending on the driver path.
                                        return results != null && !results.isEmpty();
                                    });
            if (Boolean.TRUE.equals(committed)) {
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
        Boolean exists = template.hasKey(JOB_PREFIX + jobId);
        return Boolean.TRUE.equals(exists);
    }

    @Override
    public Optional<String> findJobIdByFileId(String fileId) {
        return Optional.ofNullable(template.opsForValue().get(FILE_INDEX_PREFIX + fileId));
    }

    @Override
    public Collection<JobStoreEntry> all() {
        // SCAN, not KEYS - KEYS blocks the Valkey server for the duration of the walk.
        ScanOptions options = ScanOptions.scanOptions().match(JOB_PREFIX + "*").count(256).build();
        List<JobStoreEntry> result = new ArrayList<>();
        try (Cursor<String> cursor = template.scan(options)) {
            while (cursor.hasNext()) {
                readEntry(cursor.next()).ifPresent(result::add);
            }
        }
        return result;
    }

    private Optional<JobStoreEntry> readEntry(String key) {
        Map<Object, Object> entries = template.opsForHash().entries(key);
        if (entries == null || entries.isEmpty()) {
            return Optional.empty();
        }
        Object jobId = entries.get("jobId");
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
        String error = entries.get("error") == null ? null : entries.get("error").toString();
        return Optional.of(
                new JobStoreEntry(
                        jobId.toString(),
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
