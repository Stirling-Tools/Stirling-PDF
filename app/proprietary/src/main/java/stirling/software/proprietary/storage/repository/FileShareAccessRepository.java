package stirling.software.proprietary.storage.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.FileShareAccess;

public interface FileShareAccessRepository extends JpaRepository<FileShareAccess, Long> {
    @Query(
            "SELECT a FROM FileShareAccess a "
                    + "LEFT JOIN FETCH a.user "
                    + "WHERE a.fileShare = :fileShare "
                    + "ORDER BY a.accessedAt DESC")
    List<FileShareAccess> findByFileShareWithUserOrderByAccessedAtDesc(
            @Param("fileShare") FileShare fileShare);

    void deleteByFileShare(FileShare fileShare);

    @Query(
            "SELECT a FROM FileShareAccess a "
                    + "JOIN FETCH a.fileShare s "
                    + "JOIN FETCH s.file f "
                    + "LEFT JOIN FETCH f.owner "
                    + "WHERE a.user = :user "
                    + "ORDER BY a.accessedAt DESC")
    List<FileShareAccess> findByUserWithShareAndFile(@Param("user") User user);
}
