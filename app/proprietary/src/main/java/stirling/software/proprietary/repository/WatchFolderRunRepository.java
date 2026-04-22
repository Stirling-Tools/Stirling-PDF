package stirling.software.proprietary.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.model.WatchFolderRun;

@Repository
public interface WatchFolderRunRepository extends JpaRepository<WatchFolderRun, Long> {

    List<WatchFolderRun> findByFolderIdOrderByProcessedAtDesc(String folderId);

    @Modifying
    @Transactional
    @Query("DELETE FROM WatchFolderRun r WHERE r.folder.id = :folderId")
    int deleteAllByFolderId(@Param("folderId") String folderId);
}
