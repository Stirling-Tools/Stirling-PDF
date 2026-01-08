package stirling.software.proprietary.storage.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.StoredFile;

public interface FileShareRepository extends JpaRepository<FileShare, Long> {
    Optional<FileShare> findByFileAndSharedWithUser(StoredFile file, User sharedWithUser);

    Optional<FileShare> findByShareToken(String shareToken);

    @Query(
            "SELECT s FROM FileShare s "
                    + "JOIN FETCH s.file f "
                    + "LEFT JOIN FETCH f.owner "
                    + "WHERE s.shareToken = :shareToken")
    Optional<FileShare> findByShareTokenWithFile(@Param("shareToken") String shareToken);

    @Query("SELECT s FROM FileShare s WHERE s.file = :file AND s.shareToken IS NOT NULL")
    List<FileShare> findShareLinks(@Param("file") StoredFile file);
}
