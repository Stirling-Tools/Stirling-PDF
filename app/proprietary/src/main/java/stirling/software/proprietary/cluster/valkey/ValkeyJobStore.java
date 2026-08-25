package stirling.software.proprietary.cluster.valkey;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.JobStore;
import stirling.software.common.cluster.JobStoreEntry;

/**
 * One hash per job plus a fileId to jobId index. Atomic on standalone/sentinel via one Lua script;
 * on cluster those keys are cross-slot, so writes are separate and hash-first to keep tears benign.
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

    // Atomic HSET+PEXPIRE: the hash must never exist without a TTL.
    private static final RedisScript<Long> HSET_WITH_TTL =
            new DefaultRedisScript<>(
                    "redis.call('HSET', KEYS[1], unpack(ARGV, 2));"
                            + " redis.call('PEXPIRE', KEYS[1], ARGV[1]); return 1",
                    Long.class);

    // Value-guarded delete: never removes an index row a newer job already owns.
    private static final RedisScript<Long> DEL_INDEX_IF_OWNER =
            new DefaultRedisScript<>(
                    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1])"
                            + " else return 0 end",
                    Long.class);

    // Non-cluster put(): hash, TTL and index rows in one round trip, so no torn write.
    // KEYS[1]=hash, KEYS[2..]=index rows; ARGV[1]=ttlMs, ARGV[2]=jobId, ARGV[3..]=fields.
    private static final RedisScript<Long> PUT_ATOMIC =
            new DefaultRedisScript<>(
                    "redis.call('HSET', KEYS[1], unpack(ARGV, 3));"
                            + " redis.call('PEXPIRE', KEYS[1], ARGV[1]);"
                            + " for i = 2, #KEYS do"
                            + " redis.call('SET', KEYS[i], ARGV[2], 'PX', ARGV[1]) end;"
                            + " return 1",
                    Long.class);

    // Non-cluster delete(): hash read, DEL and the value-guarded index deletes in one round trip.
    // ARGV[1]=jobId, ARGV[2]=index prefix; malformed fileIds JSON must not error the script.
    private static final RedisScript<Long> DELETE_JOB_AND_INDEX =
            new DefaultRedisScript<>(
                    "local ids = redis.call('HGET', KEYS[1], 'fileIds');"
                            + " redis.call('DEL', KEYS[1]);"
                            + " if not ids then return 0 end;"
                            + " local ok, decoded = pcall(cjson.decode, ids);"
                            + " if not ok or type(decoded) ~= 'table' then return 0 end;"
                            + " local n = 0;"
                            + " for i = 1, #decoded do"
                            + " if type(decoded[i]) == 'string' then"
                            + " local k = ARGV[2] .. decoded[i];"
                            + " if redis.call('GET', k) == ARGV[1] then"
                            + " n = n + redis.call('DEL', k) end end end;"
                            + " return n",
                    Long.class);

    private final StringRedisTemplate template;

    // Cluster rejects a script spanning the job key and its index keys: they hash to other slots.
    private boolean isClusterAware() {
        RedisConnectionFactory factory = template.getConnectionFactory();
        return factory instanceof LettuceConnectionFactory lettuce && lettuce.isClusterAware();
    }

    @Override
    public void put(JobStoreEntry entry, Duration ttl) {
        String key = JOB_PREFIX + entry.jobId();
        long ttlMs = ttl.toMillis();
        // SET..PX rejects a non-positive TTL, so an already-expired entry deletes instead.
        // Reachable via stirling.jobResultExpiryMinutes=0.
        if (ttlMs <= 0) {
            if (entry.fileIds() != null) {
                for (String fileId : entry.fileIds()) {
                    // Value-guarded like delete(): never drop a row a newer job already owns.
                    template.execute(
                            DEL_INDEX_IF_OWNER, List.of(FILE_INDEX_PREFIX + fileId), entry.jobId());
                }
            }
            template.delete(key);
            return;
        }
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

        List<String> indexKeys = new ArrayList<>();
        if (entry.fileIds() != null) {
            for (String fileId : entry.fileIds()) {
                indexKeys.add(FILE_INDEX_PREFIX + fileId);
            }
        }
        List<String> fieldArgs = new ArrayList<>(fields.size() * 2);
        for (Map.Entry<String, String> f : fields.entrySet()) {
            fieldArgs.add(f.getKey());
            fieldArgs.add(f.getValue());
        }
        if (!isClusterAware()) {
            List<String> keys = new ArrayList<>(1 + indexKeys.size());
            keys.add(key);
            keys.addAll(indexKeys);
            List<String> args = new ArrayList<>(2 + fieldArgs.size());
            args.add(Long.toString(ttlMs));
            args.add(entry.jobId());
            args.addAll(fieldArgs);
            template.execute(PUT_ATOMIC, keys, args.toArray());
            return;
        }
        // Cluster only: hash first, so a torn write leaves an unindexed job rather than an index
        // row pointing at a hash that does not exist.
        List<String> args = new ArrayList<>(1 + fieldArgs.size());
        args.add(Long.toString(ttlMs));
        args.addAll(fieldArgs);
        template.execute(HSET_WITH_TTL, List.of(key), args.toArray());
        for (String indexKey : indexKeys) {
            template.opsForValue().set(indexKey, entry.jobId(), ttl);
        }
    }

    @Override
    public Optional<JobStoreEntry> get(String jobId) {
        return readEntry(JOB_PREFIX + jobId);
    }

    /**
     * Live path: /api/v1/general/jobs/cleanup and /api/v1/admin/job/cleanup?force=true, neither
     * gated by shouldRunLocalCleanup(). One script except on cluster, where a put() can interleave.
     */
    @Override
    public void delete(String jobId) {
        String jobKey = JOB_PREFIX + jobId;
        if (!isClusterAware()) {
            template.execute(DELETE_JOB_AND_INDEX, List.of(jobKey), jobId, FILE_INDEX_PREFIX);
            return;
        }
        String fileIdsJson = (String) template.opsForHash().get(jobKey, "fileIds");
        template.delete(jobKey);
        if (fileIdsJson == null) {
            return;
        }
        for (String fileId : readJsonList(fileIdsJson, jobKey)) {
            template.execute(DEL_INDEX_IF_OWNER, List.of(FILE_INDEX_PREFIX + fileId), jobId);
        }
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
        // SCAN, not KEYS - KEYS blocks the Valkey server for the duration of the walk. On Cluster
        // Lettuce walks every master, so this is a best-effort snapshot, not a point-in-time one.
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
