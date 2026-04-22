package stirling.software.proprietary.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.model.WatchFolderFile;

@Repository
public interface WatchFolderFileRepository extends JpaRepository<WatchFolderFile, Long> {

    List<WatchFolderFile> findByFolderIdOrderByAddedAtDesc(String folderId);

    Optional<WatchFolderFile> findByFolderIdAndFileId(String folderId, String fileId);

    @Modifying
    @Transactional
    @Query("DELETE FROM WatchFolderFile f WHERE f.folder.id = :folderId")
    int deleteAllByFolderId(@Param("folderId") String folderId);
}
