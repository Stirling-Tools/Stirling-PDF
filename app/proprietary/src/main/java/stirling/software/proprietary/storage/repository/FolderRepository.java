package stirling.software.proprietary.storage.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.Folder;

public interface FolderRepository extends JpaRepository<Folder, UUID> {

    Optional<Folder> findByIdAndOwner(UUID id, User owner);

    List<Folder> findAllByOwnerOrderByName(User owner);

    long countByOwner(User owner);

    /**
     * Clear the folder reference on every file currently inside any of the given folders. Used when
     * a folder subtree is deleted - files fall back to the root rather than dangling.
     *
     * <p>{@code flushAutomatically + clearAutomatically} forces Hibernate to flush any cached dirty
     * {@code StoredFile} entities before the bulk UPDATE runs, and clears the persistence context
     * afterwards so a subsequent {@code deleteAllByIdInBatch} on the parent folders doesn't see
     * stale entity state referencing the about-to-be-deleted folder.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE StoredFile sf SET sf.folder = null WHERE sf.folder.id IN :folderIds")
    void clearFolderForFiles(@Param("folderIds") List<UUID> folderIds);
}
