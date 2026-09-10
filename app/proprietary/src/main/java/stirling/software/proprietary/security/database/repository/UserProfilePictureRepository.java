package stirling.software.proprietary.security.database.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.security.model.UserProfilePicture;

/**
 * Reads are column projections, not entity loads: loading the entity would drag the full-size image
 * bytes along even when only a flag or a thumbnail is wanted.
 */
@Repository
public interface UserProfilePictureRepository extends JpaRepository<UserProfilePicture, Long> {

    /** Which of these users have an avatar; no image bytes are read. */
    @Query("SELECT p.userId FROM UserProfilePicture p WHERE p.userId IN :ids")
    List<Long> findUserIdsWithPicture(@Param("ids") Collection<Long> ids);

    /** (userId, thumbnailData) for the roster batch endpoint. */
    @Query("SELECT p.userId, p.thumbnailData FROM UserProfilePicture p WHERE p.userId IN :ids")
    List<Object[]> findThumbnailsByUserIds(@Param("ids") Collection<Long> ids);

    /** (imageData, contentType) for a single avatar; empty when the user has none. */
    @Query("SELECT p.imageData, p.contentType FROM UserProfilePicture p WHERE p.userId = :id")
    List<Object[]> findImageByUserId(@Param("id") Long id);

    void deleteByUserId(Long userId);
}
