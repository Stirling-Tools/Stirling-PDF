package stirling.software.proprietary.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.model.WatchFolder;
import stirling.software.proprietary.model.watchfolder.FolderScope;

@Repository
public interface WatchFolderRepository extends JpaRepository<WatchFolder, String> {

    List<WatchFolder> findByOwnerIdOrderByOrderIndexAscCreatedAtAsc(Long ownerId);

    List<WatchFolder> findByScopeOrderByOrderIndexAscCreatedAtAsc(FolderScope scope);

    /**
     * Return all folders visible to a user: those they own plus any folder with the given scope
     * (normally {@link FolderScope#ORGANISATION}). A secondary sort on {@code createdAt} keeps
     * output stable across databases when {@code orderIndex} is null for multiple rows.
     */
    @Query(
            "SELECT f FROM WatchFolder f "
                    + "WHERE (f.owner IS NOT NULL AND f.owner.id = :ownerId) "
                    + "OR f.scope = :scope "
                    + "ORDER BY f.orderIndex ASC, f.createdAt ASC")
    List<WatchFolder> findVisibleToUser(
            @Param("ownerId") Long ownerId, @Param("scope") FolderScope scope);
}
