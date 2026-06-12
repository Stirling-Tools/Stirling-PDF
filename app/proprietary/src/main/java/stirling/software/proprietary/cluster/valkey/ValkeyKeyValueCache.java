package stirling.software.proprietary.cluster.valkey;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import io.quarkus.redis.datasource.RedisDataSource;
import io.quarkus.redis.datasource.keys.KeyScanArgs;
import io.quarkus.redis.datasource.keys.KeyScanCursor;
import io.quarkus.redis.datasource.value.SetArgs;
import io.quarkus.redis.datasource.value.ValueCommands;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.common.cluster.KeyValueCache;

// TODO: Migration required - @ConditionalOnValkeyBackplane (a Spring @ConditionalOnExpression
// composite on cluster.enabled + cluster.backplane=valkey) has no direct CDI equivalent. Once that
// collaborator annotation is migrated, re-guard this bean (e.g. @io.quarkus.arc.lookup.LookupIfProperty
// or @io.quarkus.arc.profile.IfBuildProfile, or a runtime guard) so Valkey beans only load when
// cluster.enabled=true AND cluster.backplane=valkey.
@ApplicationScoped
public class ValkeyKeyValueCache implements KeyValueCache {

    private static final String PREFIX = "stirling:kv:";

    private final RedisDataSource redis;
    private final ValueCommands<String, String> values;

    public ValkeyKeyValueCache(RedisDataSource redis) {
        this.redis = redis;
        this.values = redis.value(String.class, String.class);
    }

    @Override
    public void put(String namespace, String key, String value, Duration ttl) {
        values.set(buildKey(namespace, key), value, new SetArgs().px(ttl.toMillis()));
    }

    @Override
    public Optional<String> get(String namespace, String key) {
        return Optional.ofNullable(values.get(buildKey(namespace, key)));
    }

    @Override
    public void evict(String namespace, String key) {
        redis.key(String.class).del(buildKey(namespace, key));
    }

    @Override
    public void evictNamespace(String namespace) {
        KeyScanArgs options = new KeyScanArgs().match(PREFIX + namespace + ":*").count(256);
        List<String> keys = new ArrayList<>();
        KeyScanCursor<String> cursor = redis.key(String.class).scan(options);
        while (cursor.hasNext()) {
            keys.addAll(cursor.next());
        }
        if (!keys.isEmpty()) {
            redis.key(String.class).del(keys.toArray(new String[0]));
        }
    }

    private String buildKey(String namespace, String key) {
        return PREFIX + namespace + ":" + key;
    }
}
