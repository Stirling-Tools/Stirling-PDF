package stirling.software.proprietary.security.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

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
}
