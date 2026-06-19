package stirling.software.saas.service;

import java.time.LocalDateTime;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.SaasUserExtensions;
import stirling.software.saas.repository.SaasUserExtensionsRepository;

/**
 * Read/write access to {@link SaasUserExtensions}. Reads return safe defaults when no row exists
 * for the user; writes create the row lazily.
 */
@ApplicationScoped
@IfBuildProfile("saas")
@RequiredArgsConstructor
@Slf4j
public class SaasUserExtensionService {

    private final SaasUserExtensionsRepository repository;

    public SaasUserExtensions getOrCreate(User user) {
        return repository
                .findByUserId(user.getId())
                .orElseGet(
                        () -> {
                            SaasUserExtensions ext = new SaasUserExtensions(user);
                            repository.persist(ext);
                            return ext;
                        });
    }

    public boolean isMeteredBillingEnabled(User user) {
        return repository
                .findByUserId(user.getId())
                .map(SaasUserExtensions::isMeteredBillingEnabled)
                .orElse(false);
    }

    @Transactional
    public void setMeteredBillingEnabled(User user, boolean enabled) {
        SaasUserExtensions ext = getOrCreate(user);
        ext.setHasMeteredBillingEnabled(enabled);
        repository.persist(ext);
    }

    public LocalDateTime getApiKeyFirstUsedAt(User user) {
        return repository
                .findByUserId(user.getId())
                .map(SaasUserExtensions::getApiKeyFirstUsedAt)
                .orElse(null);
    }

    /** Idempotent first-use marker. Records the first time this user's API key fired a request. */
    @Transactional
    public void trackApiKeyFirstUse(User user) {
        SaasUserExtensions ext = getOrCreate(user);
        if (ext.getApiKeyFirstUsedAt() == null) {
            ext.setApiKeyFirstUsedAt(LocalDateTime.now());
            repository.persist(ext);
        }
    }
}
