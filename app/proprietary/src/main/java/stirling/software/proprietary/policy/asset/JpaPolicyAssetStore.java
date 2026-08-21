package stirling.software.proprietary.policy.asset;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.integration.crypto.CredentialEncryption;

/**
 * Durable {@link PolicyAssetStore} backed by JPA; the runtime store. Bytes are encrypted at rest
 * here rather than by an attribute converter, so the metadata reads (list, validate, clean up)
 * never decrypt - only {@link #content} does.
 */
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
        // Plaintext length: it is the size the UI shows, not the stored ciphertext's.
        entity.setFileSize(content.length);
        entity.setOwner(asset.owner());
        entity.setTeamId(asset.teamId());
        entity.setCreatedAt(asset.createdAt());
        entity.setData(CredentialEncryption.encryptBytes(content));
        repository.save(entity);
        return toAsset(entity);
    }

    @Override
    public Optional<PolicyAsset> get(String id) {
        return repository.findMetaById(id);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<byte[]> content(String id) {
        // The only read of the data column, and so the only decrypt.
        return repository
                .findById(id)
                .map(entity -> CredentialEncryption.decryptBytes(entity.getData()));
    }

    @Override
    public List<PolicyAsset> findByTeam(Long teamId) {
        return repository.findMetaByTeam(teamId);
    }

    @Override
    public List<PolicyAsset> all() {
        return repository.findAllMeta();
    }

    @Override
    public List<String> idsCreatedBefore(long cutoff) {
        return repository.findIdsCreatedBefore(cutoff);
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
                entity.getFileSize(),
                entity.getOwner(),
                entity.getTeamId(),
                entity.getCreatedAt());
    }
}
