package stirling.software.proprietary.security.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;

import stirling.software.proprietary.model.UserLicenseSettings;

@Repository
public interface UserLicenseSettingsRepository extends JpaRepository<UserLicenseSettings, Long> {

    /**
     * Finds the singleton UserLicenseSettings record.
     *
     * @return Optional containing the settings if they exist
     */
    default Optional<UserLicenseSettings> findSettings() {
        return findById(UserLicenseSettings.SINGLETON_ID);
    }

    /**
     * Reads the singleton row under a write lock, so that concurrent callers serialise behind
     * whoever holds it until that transaction commits. Used to admit users against the licensed
     * limit: the seat count is only trustworthy if nobody else can insert a user between the count
     * and our own insert.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from UserLicenseSettings s where s.id = :id")
    Optional<UserLicenseSettings> findSettingsForUpdate(@Param("id") Long id);

    default Optional<UserLicenseSettings> lockSettings() {
        return findSettingsForUpdate(UserLicenseSettings.SINGLETON_ID);
    }
}
