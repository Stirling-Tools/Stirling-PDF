package stirling.software.proprietary.cache;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserIdentity;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

@Slf4j
@Service
public class ExternalWriteEvictionService {

    public static final int MAX_IDS = 1000;

    public record Request(
            List<UUID> supabaseUserIds,
            List<Long> userIds,
            List<String> usernames,
            List<Long> teamIds) {

        int size() {
            return count(supabaseUserIds) + count(userIds) + count(usernames) + count(teamIds);
        }

        private static int count(List<?> values) {
            return values == null ? 0 : values.size();
        }
    }

    private static final String USER = User.class.getName();
    private static final String TEAM = Team.class.getName();

    private final UserRepository userRepository;
    private final CacheEvictionBroadcaster broadcaster;

    public ExternalWriteEvictionService(
            UserRepository userRepository, CacheEvictionBroadcaster broadcaster) {
        this.userRepository = userRepository;
        this.broadcaster = broadcaster;
    }

    public List<CacheEviction> evict(Request request) {
        if (request.size() > MAX_IDS) {
            throw new IllegalArgumentException(
                    "At most " + MAX_IDS + " identifiers per eviction request");
        }
        Set<CacheEviction> evictions = new LinkedHashSet<>();
        boolean unresolvedUser =
                addUsers(
                                evictions,
                                nonEmpty(request.supabaseUserIds()),
                                userRepository::findIdentitiesBySupabaseIdIn,
                                UserIdentity::supabaseId)
                        | addUsers(
                                evictions,
                                nonEmpty(request.userIds()),
                                userRepository::findIdentitiesByIdIn,
                                UserIdentity::id)
                        | addUsers(
                                evictions,
                                nonEmpty(request.usernames()),
                                userRepository::findIdentitiesByUsernameIn,
                                UserIdentity::username);
        for (String username : nonEmpty(request.usernames())) {
            evictions.add(CacheEviction.naturalId(USER, username));
        }
        if (unresolvedUser) {
            evictions.add(CacheEviction.entityRegion(USER));
        }
        for (Long teamId : nonEmpty(request.teamIds())) {
            evictions.add(CacheEviction.entityWithCollections(TEAM, teamId.toString()));
        }
        List<CacheEviction> batch = new ArrayList<>(evictions);
        broadcaster.broadcast(batch);
        log.info(
                "Evicted {} second-level cache target(s) after an external write{}",
                batch.size(),
                unresolvedUser ? " (an unknown user cleared the user region)" : "");
        return batch;
    }

    private static <K> boolean addUsers(
            Set<CacheEviction> evictions,
            Collection<K> keys,
            Function<Collection<K>, List<UserIdentity>> resolve,
            Function<UserIdentity, K> keyOf) {
        if (keys.isEmpty()) {
            return false;
        }
        Set<K> distinct = new LinkedHashSet<>(keys);
        List<UserIdentity> found = resolve.apply(distinct);
        Set<K> resolvedKeys = new HashSet<>();
        for (UserIdentity identity : found) {
            evictions.add(CacheEviction.entityWithCollections(USER, identity.id().toString()));
            if (identity.username() != null) {
                evictions.add(CacheEviction.naturalId(USER, identity.username()));
            }
            resolvedKeys.add(keyOf.apply(identity));
        }
        return !resolvedKeys.containsAll(distinct);
    }

    private static <T> List<T> nonEmpty(List<T> values) {
        return values == null ? List.of() : values.stream().filter(Objects::nonNull).toList();
    }
}
