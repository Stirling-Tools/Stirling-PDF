package stirling.software.proprietary.security.repository;

import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepository;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.proprietary.model.UserLicenseSettings;

@ApplicationScoped
public class UserLicenseSettingsRepository implements PanacheRepository<UserLicenseSettings> {

    /**
     * Finds the singleton UserLicenseSettings record.
     *
     * @return Optional containing the settings if they exist
     */
    public Optional<UserLicenseSettings> findSettings() {
        return findByIdOptional(UserLicenseSettings.SINGLETON_ID);
    }
}
