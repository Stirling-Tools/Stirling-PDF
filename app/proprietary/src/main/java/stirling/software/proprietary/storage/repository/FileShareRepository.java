package stirling.software.proprietary.storage.repository;

import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepository;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.StoredFile;

@ApplicationScoped
public class FileShareRepository implements PanacheRepository<FileShare> {

    public Optional<FileShare> findByFileAndSharedWithUser(StoredFile file, User sharedWithUser) {
        return find("file = ?1 and sharedWithUser = ?2", file, sharedWithUser)
                .firstResultOptional();
    }

    public Optional<FileShare> findByShareToken(String shareToken) {
        return find("shareToken", shareToken).firstResultOptional();
    }

    public Optional<FileShare> findByShareTokenWithFile(String shareToken) {
        return find(
                        "SELECT s FROM FileShare s "
                                + "JOIN FETCH s.file f "
                                + "LEFT JOIN FETCH f.owner "
                                + "WHERE s.shareToken = ?1",
                        shareToken)
                .firstResultOptional();
    }

    public List<FileShare> findShareLinks(StoredFile file) {
        return find(
                        "SELECT s FROM FileShare s WHERE s.file = ?1 AND s.shareToken IS NOT NULL",
                        file)
                .list();
    }

    public List<FileShare> findBySharedWithUser(User sharedWithUser) {
        return find("sharedWithUser", sharedWithUser).list();
    }

    public List<FileShare> findByExpiresAtBeforeAndShareTokenNotNull(java.time.LocalDateTime now) {
        return find("expiresAt < ?1 and shareToken is not null", now).list();
    }

    public List<FileShare> findBySharedWithUserAndFileIn(User user, List<StoredFile> files) {
        return find(
                        "SELECT s FROM FileShare s "
                                + "JOIN FETCH s.file f "
                                + "WHERE s.sharedWithUser = ?1 AND f IN ?2",
                        user,
                        files)
                .list();
    }
}
