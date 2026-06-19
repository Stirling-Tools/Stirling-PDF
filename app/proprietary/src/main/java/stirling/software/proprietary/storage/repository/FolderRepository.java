package stirling.software.proprietary.storage.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.Folder;

/**
 * Quarkus Panache repository for {@link Folder}.
 *
 * <p>Migrated from a Spring Data {@code JpaRepository<Folder, UUID>}. Derived finders are
 * reimplemented as Panache queries and the original {@code @Modifying @Query} bulk UPDATE keeps its
 * JPQL string passed to Panache {@code update}.
 */
@ApplicationScoped
public class FolderRepository implements PanacheRepositoryBase<Folder, UUID> {

    public Optional<Folder> findByIdAndOwner(UUID id, User owner) {
        return find("id = ?1 and owner = ?2", id, owner).firstResultOptional();
    }

    public List<Folder> findAllByOwnerOrderByName(User owner) {
        return list("owner = ?1 order by name", owner);
    }

    public long countByOwner(User owner) {
        return count("owner", owner);
    }

    /** Spring Data {@code existsById(id)} -> Panache count by id. */
    public boolean existsById(UUID id) {
        return count("id", id) > 0;
    }

    /**
     * Spring Data {@code saveAndFlush(folder)}. Panache {@code persist} handles both insert and
     * (for a managed/attached entity) the dirty-checking update; the explicit {@code flush} keeps
     * the original eager-flush semantics the callers relied on.
     */
    @Transactional
    public Folder saveAndFlush(Folder folder) {
        persist(folder);
        flush();
        return folder;
    }

    /** Spring Data {@code deleteAllByIdInBatch(ids)} -> Panache bulk delete by id collection. */
    @Transactional
    public void deleteAllByIdInBatch(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return;
        }
        delete("id in ?1", ids);
    }

    /**
     * Clear the folder reference on every file currently inside any of the given folders. Used when
     * a folder subtree is deleted - files fall back to the root rather than dangling.
     *
     * <p>The original Spring Data method used {@code @Modifying(flushAutomatically = true,
     * clearAutomatically = true)} to flush cached dirty {@code StoredFile} entities before the bulk
     * UPDATE and clear the persistence context afterwards, so a subsequent {@code
     * deleteAllByIdInBatch} on the parent folders wouldn't see stale state referencing the
     * about-to-be-deleted folder. We reproduce that here with an explicit flush before and a clear
     * after the Panache bulk {@code update}.
     */
    @Transactional
    public void clearFolderForFiles(List<UUID> folderIds) {
        if (folderIds == null || folderIds.isEmpty()) {
            return;
        }
        getEntityManager().flush();
        update("UPDATE StoredFile sf SET sf.folder = null WHERE sf.folder.id IN ?1", folderIds);
        getEntityManager().clear();
    }
}
