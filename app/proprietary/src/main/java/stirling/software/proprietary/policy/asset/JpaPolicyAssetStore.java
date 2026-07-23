package stirling.software.proprietary.policy.asset;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/** Durable {@link PolicyAssetStore} backed by JPA; the runtime store. */
@Service
@RequiredArgsConstructor
public class JpaPolicyAssetStore implements PolicyAssetStore {

    private final PolicyAssetRepository repository;

    @Override
    @Transactional
    public PolicyAsset save(PolicyAsset asset, byte[] content) {
        String id =
                asset.id() == null || asset.id().isBlank()
                        ? UUID.randomUUID().toString()
                        : asset.id();
        PolicyAssetEntity entity = new PolicyAssetEntity();
        entity.setId(id);
        entity.setFileName(asset.fileName());
        entity.setContentType(asset.contentType());
        entity.setSize(content.length);
        entity.setOwner(asset.owner());
        entity.setTeamId(asset.teamId());
        entity.setCreatedAt(asset.createdAt());
        entity.setData(content);
        repository.save(entity);
        return toAsset(entity);
    }

    @Override
    public Optional<PolicyAsset> get(String id) {
        return repository.findById(id).map(JpaPolicyAssetStore::toAsset);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<byte[]> content(String id) {
        // Read inside a transaction: the data column is a lazily-fetched LOB.
        return repository.findById(id).map(PolicyAssetEntity::getData);
    }

    @Override
    public List<PolicyAsset> findByTeam(Long teamId) {
        return repository.findByTeam(teamId).stream().map(JpaPolicyAssetStore::toAsset).toList();
    }

    @Override
    public List<PolicyAsset> all() {
        return repository.findAll().stream().map(JpaPolicyAssetStore::toAsset).toList();
    }

    @Override
    @Transactional
    public boolean delete(String id) {
        if (!repository.existsById(id)) {
            return false;
        }
        repository.deleteById(id);
        return true;
    }

    private static PolicyAsset toAsset(PolicyAssetEntity entity) {
        return new PolicyAsset(
                entity.getId(),
                entity.getFileName(),
                entity.getContentType(),
                entity.getSize(),
                entity.getOwner(),
                entity.getTeamId(),
                entity.getCreatedAt());
    }
}
