package stirling.software.saas.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.proprietary.security.model.User;

/** Constructor, defaults, accessor, and isMeteredBillingEnabled tests for SaasUserExtensions. */
class SaasUserExtensionsTest {

    @Test
    @DisplayName("no-arg constructor defaults metered billing off")
    void defaults() {
        SaasUserExtensions ext = new SaasUserExtensions();
        assertThat(ext.getHasMeteredBillingEnabled()).isFalse();
        assertThat(ext.isMeteredBillingEnabled()).isFalse();
        assertThat(ext.getApiKeyFirstUsedAt()).isNull();
    }

    @Test
    @DisplayName("User constructor derives the user id from the user reference")
    void userConstructor() {
        User user = new User();
        user.setId(42L);
        SaasUserExtensions ext = new SaasUserExtensions(user);
        assertThat(ext.getUser()).isSameAs(user);
        assertThat(ext.getUserId()).isEqualTo(42L);
    }

    @Test
    @DisplayName("every setter round-trips through its getter")
    void settersRoundTrip() {
        LocalDateTime firstUsed = LocalDateTime.of(2026, 6, 1, 12, 0);
        LocalDateTime created = LocalDateTime.of(2026, 6, 1, 0, 0);
        LocalDateTime updated = LocalDateTime.of(2026, 6, 2, 0, 0);

        SaasUserExtensions ext = new SaasUserExtensions();
        ext.setUserId(5L);
        ext.setHasMeteredBillingEnabled(Boolean.TRUE);
        ext.setApiKeyFirstUsedAt(firstUsed);
        ext.setCreatedAt(created);
        ext.setUpdatedAt(updated);

        assertThat(ext.getUserId()).isEqualTo(5L);
        assertThat(ext.getHasMeteredBillingEnabled()).isTrue();
        assertThat(ext.getApiKeyFirstUsedAt()).isEqualTo(firstUsed);
        assertThat(ext.getCreatedAt()).isEqualTo(created);
        assertThat(ext.getUpdatedAt()).isEqualTo(updated);
    }

    @Test
    @DisplayName("isMeteredBillingEnabled is true only for Boolean.TRUE, null-safe otherwise")
    void isMeteredBillingEnabled() {
        SaasUserExtensions ext = new SaasUserExtensions();
        assertThat(ext.isMeteredBillingEnabled()).isFalse();

        ext.setHasMeteredBillingEnabled(Boolean.TRUE);
        assertThat(ext.isMeteredBillingEnabled()).isTrue();

        ext.setHasMeteredBillingEnabled(null);
        assertThat(ext.isMeteredBillingEnabled()).isFalse();
    }
}
