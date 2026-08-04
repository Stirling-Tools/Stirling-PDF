package stirling.software.proprietary.security.repository;

import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Sort;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.proprietary.security.model.ApiKey;

@ApplicationScoped
public class ApiKeyRepository implements PanacheRepositoryBase<ApiKey, Long> {

    public Optional<ApiKey> findByKeyHash(String keyHash) {
        return find("keyHash", keyHash).firstResultOptional();
    }

    public boolean existsByKeyHash(String keyHash) {
        return count("keyHash", keyHash) > 0;
    }

    public List<ApiKey> findByOwnerUserIdOrderByCreatedAtDesc(Long ownerUserId) {
        return list("ownerUserId", Sort.descending("createdAt"), ownerUserId);
    }

    /** Spring Data {@code save}: insert a new row, merge an already-identified one. */
    @Transactional
    public ApiKey save(ApiKey key) {
        if (key.getId() == null) {
            persist(key);
            return key;
        }
        return getEntityManager().merge(key);
    }

    /** Spring Data {@code saveAndFlush}: flushes so a unique-key clash surfaces here. */
    @Transactional
    public ApiKey saveAndFlush(ApiKey key) {
        persistAndFlush(key);
        return key;
    }
}
