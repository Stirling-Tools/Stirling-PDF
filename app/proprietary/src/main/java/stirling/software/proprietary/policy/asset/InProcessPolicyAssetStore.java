package stirling.software.proprietary.policy.asset;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory {@link PolicyAssetStore} for tests and any future no-database mode. {@link
 * JpaPolicyAssetStore} is the runtime bean.
 */
public class InProcessPolicyAssetStore implements PolicyAssetStore {

    private final Map<String, PolicyAsset> assets = new ConcurrentHashMap<>();
    private final Map<String, byte[]> contents = new ConcurrentHashMap<>();

    @Override
    public PolicyAsset save(PolicyAsset asset, byte[] content) {
        String id =
                asset.id() == null || asset.id().isBlank()
                        ? UUID.randomUUID().toString()
                        : asset.id();
        PolicyAsset stored =
                new PolicyAsset(
                        id,
                        asset.fileName(),
                        asset.contentType(),
                        content.length,
                        asset.owner(),
                        asset.teamId(),
                        asset.createdAt());
        assets.put(id, stored);
        contents.put(id, content);
        return stored;
    }

    @Override
    public Optional<PolicyAsset> get(String id) {
        return Optional.ofNullable(assets.get(id));
    }

    @Override
    public Optional<byte[]> content(String id) {
        return Optional.ofNullable(contents.get(id));
    }

    @Override
    public List<PolicyAsset> findByTeam(Long teamId) {
        return assets.values().stream()
                .filter(asset -> Objects.equals(asset.teamId(), teamId))
                .sorted(newestFirst())
                .toList();
    }

    @Override
    public List<PolicyAsset> all() {
        return assets.values().stream().sorted(newestFirst()).toList();
    }

    @Override
    public boolean delete(String id) {
        contents.remove(id);
        return assets.remove(id) != null;
    }

    private static Comparator<PolicyAsset> newestFirst() {
        return Comparator.comparingLong(PolicyAsset::createdAt)
                .reversed()
                .thenComparing(PolicyAsset::id);
    }
}
