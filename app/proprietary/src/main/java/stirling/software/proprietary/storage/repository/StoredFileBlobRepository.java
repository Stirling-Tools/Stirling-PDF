package stirling.software.proprietary.storage.repository;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.proprietary.storage.model.StoredFileBlob;

/**
 * Quarkus Panache repository for {@link StoredFileBlob}.
 *
 * <p>Migrated from a Spring Data {@code JpaRepository<StoredFileBlob, String>}. The String id keeps
 * {@link PanacheRepositoryBase} with {@code <StoredFileBlob, String>}; callers map {@code save ->
 * persist}, {@code findById -> findByIdOptional}, {@code deleteById -> deleteById}.
 */
@ApplicationScoped
public class StoredFileBlobRepository implements PanacheRepositoryBase<StoredFileBlob, String> {}
