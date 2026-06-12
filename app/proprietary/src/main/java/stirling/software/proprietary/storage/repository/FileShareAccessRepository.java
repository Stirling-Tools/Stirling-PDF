package stirling.software.proprietary.storage.repository;

import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.FileShareAccess;

/**
 * Quarkus Panache repository for {@link FileShareAccess}.
 *
 * <p>Migrated from a Spring Data {@code JpaRepository<FileShareAccess, Long>}. The {@code @Query}
 * methods keep their original JPQL strings passed to Panache {@code list}, and the derived {@code
 * deleteByXxx} finders become Panache {@code delete} calls.
 */
@ApplicationScoped
public class FileShareAccessRepository implements PanacheRepositoryBase<FileShareAccess, Long> {

    public List<FileShareAccess> findByFileShareWithUserOrderByAccessedAtDesc(FileShare fileShare) {
        return list(
                "SELECT a FROM FileShareAccess a "
                        + "LEFT JOIN FETCH a.user "
                        + "WHERE a.fileShare = ?1 "
                        + "ORDER BY a.accessedAt DESC",
                fileShare);
    }

    @Transactional
    public void deleteByFileShare(FileShare fileShare) {
        delete("fileShare", fileShare);
    }

    @Transactional
    public void deleteByUser(User user) {
        delete("user", user);
    }

    public List<FileShareAccess> findByUserWithShareAndFile(User user) {
        return list(
                "SELECT a FROM FileShareAccess a "
                        + "JOIN FETCH a.fileShare s "
                        + "JOIN FETCH s.file f "
                        + "LEFT JOIN FETCH f.owner "
                        + "WHERE a.user = ?1 "
                        + "ORDER BY a.accessedAt DESC",
                user);
    }
}
