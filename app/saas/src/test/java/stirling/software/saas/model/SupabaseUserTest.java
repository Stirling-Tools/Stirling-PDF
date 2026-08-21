package stirling.software.saas.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Lombok @Data coverage for the SupabaseUser auth.users mirror: accessors, equals/hashCode. */
class SupabaseUserTest {

    private static SupabaseUser user(UUID id) {
        SupabaseUser u = new SupabaseUser();
        u.setId(id);
        u.setEmail("user@example.com");
        u.setSSOUser(true);
        u.setAnonymous(false);
        u.setCreatedAt(LocalDateTime.of(2026, 6, 1, 0, 0));
        return u;
    }

    @Test
    @DisplayName("every accessor round-trips its value")
    void accessors() {
        UUID id = UUID.randomUUID();
        SupabaseUser u = user(id);
        assertThat(u.getId()).isEqualTo(id);
        assertThat(u.getEmail()).isEqualTo("user@example.com");
        assertThat(u.isSSOUser()).isTrue();
        assertThat(u.isAnonymous()).isFalse();
        assertThat(u.getCreatedAt()).isEqualTo(LocalDateTime.of(2026, 6, 1, 0, 0));
    }

    @Test
    @DisplayName("boolean flags default to false on a fresh instance")
    void booleanDefaults() {
        SupabaseUser u = new SupabaseUser();
        assertThat(u.isSSOUser()).isFalse();
        assertThat(u.isAnonymous()).isFalse();
    }

    @Test
    @DisplayName("equal field values produce equal users with matching hash codes")
    void equalsAndHashCode() {
        UUID id = UUID.randomUUID();
        SupabaseUser a = user(id);
        SupabaseUser b = user(id);
        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        assertThat(a).isEqualTo(a);
    }

    @Test
    @DisplayName("a different id breaks equality; null and foreign types are unequal")
    void notEqual() {
        SupabaseUser a = user(UUID.randomUUID());
        SupabaseUser b = user(UUID.randomUUID());
        assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
    }

    @Test
    @DisplayName("toString is non-null and mentions a field")
    void toStringMentionsField() {
        assertThat(user(UUID.randomUUID()).toString()).contains("email");
    }
}
