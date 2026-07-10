package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.GrantedAuthority;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKey;
import stirling.software.proprietary.security.model.ApiKeyScope;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.ApiKeyRepository;

@ExtendWith(MockitoExtension.class)
@DisplayName("ApiKeyAuthenticationService")
class ApiKeyAuthenticationServiceTest {

    @Mock private ApiKeyRepository apiKeyRepository;
    @Mock private ApiKeyUsageRecorder usageRecorder;
    @Mock private UserRepository userRepository;
    @InjectMocks private ApiKeyAuthenticationService service;

    private User user(long id, boolean enabled) {
        User u = new User();
        u.setId(id);
        u.setUsername("user" + id);
        u.setEnabled(enabled);
        return u;
    }

    private ApiKey key(long id, long ownerId, boolean enabled, Instant revoked) {
        return ApiKey.builder()
                .id(id)
                .name("Production ingest")
                .keyHash(ApiKeyHasher.hash("raw-" + id))
                .prefix("sk_demo0000")
                .ownerUserId(ownerId)
                .scope(ApiKeyScope.PERSONAL)
                .enabled(enabled)
                .revokedAt(revoked)
                .createdAt(Instant.now())
                .build();
    }

    @Test
    @DisplayName("resolves an active multi-key to its owner and records usage")
    void resolvesActiveKey() {
        String raw = "raw-1";
        when(apiKeyRepository.findByKeyHash(ApiKeyHasher.hash(raw)))
                .thenReturn(Optional.of(key(1, 7, true, null)));
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(7, true)));

        var result = service.authenticate(raw);

        assertThat(result).isPresent();
        assertThat(result.get().user().getId()).isEqualTo(7L);
        assertThat(result.get().auditLabel()).isEqualTo("Production ingest (sk_demo0000)");
        verify(usageRecorder).record(1L);
    }

    @Test
    @DisplayName("rejects a revoked key without recording usage")
    void rejectsRevokedKey() {
        String raw = "raw-2";
        when(apiKeyRepository.findByKeyHash(ApiKeyHasher.hash(raw)))
                .thenReturn(Optional.of(key(2, 7, true, Instant.now())));

        assertThat(service.authenticate(raw)).isEmpty();
        verifyNoInteractions(usageRecorder);
    }

    @Test
    @DisplayName("rejects a key whose owner is disabled")
    void rejectsDisabledOwner() {
        String raw = "raw-3";
        when(apiKeyRepository.findByKeyHash(ApiKeyHasher.hash(raw)))
                .thenReturn(Optional.of(key(3, 8, true, null)));
        when(userRepository.findById(8L)).thenReturn(Optional.of(user(8, false)));

        assertThat(service.authenticate(raw)).isEmpty();
    }

    @Test
    @DisplayName("falls back to the legacy per-user column, with no per-key label")
    void legacyFallback() {
        String raw = "legacy-key";
        when(apiKeyRepository.findByKeyHash(ApiKeyHasher.hash(raw))).thenReturn(Optional.empty());
        when(userRepository.findByApiKey(raw)).thenReturn(Optional.of(user(9, true)));

        var result = service.authenticate(raw);

        assertThat(result).isPresent();
        assertThat(result.get().user().getId()).isEqualTo(9L);
        assertThat(result.get().auditLabel()).isNull();
        verifyNoInteractions(usageRecorder);
    }

    @Test
    @DisplayName("blank keys resolve to nothing")
    void blankKey() {
        assertThat(service.authenticate("  ")).isEmpty();
        assertThat(service.resolveUser(null)).isEmpty();
    }

    @Test
    @DisplayName("a team key drops admin from the acting authorities (shared credential)")
    void teamKeyCapsAdminAuthority() {
        String raw = "raw-team";
        User owner = user(7, true);
        owner.addAuthority(new Authority(Role.ADMIN.getRoleId(), owner));
        ApiKey teamKey =
                ApiKey.builder()
                        .id(5L)
                        .name("Team key")
                        .keyHash(ApiKeyHasher.hash(raw))
                        .prefix("sk_demo0000")
                        .ownerUserId(7L)
                        .teamId(3L)
                        .scope(ApiKeyScope.TEAM_MEMBERS)
                        .enabled(true)
                        .createdAt(Instant.now())
                        .build();
        when(apiKeyRepository.findByKeyHash(ApiKeyHasher.hash(raw)))
                .thenReturn(Optional.of(teamKey));
        when(userRepository.findById(7L)).thenReturn(Optional.of(owner));

        var result = service.authenticate(raw);

        assertThat(result).isPresent();
        List<String> auths =
                result.get().authorities().stream().map(GrantedAuthority::getAuthority).toList();
        assertThat(auths).doesNotContain(Role.ADMIN.getRoleId()).contains(Role.USER.getRoleId());
        // Marked team-scoped so SaaS team-leader checks (a membership lookup, not an authority)
        // won't treat this shared key as a leader.
        assertThat(result.get().teamScoped()).isTrue();
    }

    @Test
    @DisplayName("a personal key keeps the owner's authorities (owner acts as self)")
    void personalKeyKeepsOwnerAuthorities() {
        String raw = "raw-6";
        User owner = user(8, true);
        owner.addAuthority(new Authority(Role.ADMIN.getRoleId(), owner));
        when(apiKeyRepository.findByKeyHash(ApiKeyHasher.hash(raw)))
                .thenReturn(Optional.of(key(6, 8, true, null)));
        when(userRepository.findById(8L)).thenReturn(Optional.of(owner));

        var result = service.authenticate(raw);

        List<String> auths =
                result.get().authorities().stream().map(GrantedAuthority::getAuthority).toList();
        assertThat(auths).contains(Role.ADMIN.getRoleId());
        // A personal key is not shared, so it is never team-scoped (keeps the owner's full role).
        assertThat(result.get().teamScoped()).isFalse();
    }

    @Test
    @DisplayName("revokeMigratedKey disables the shadow row so a rotated legacy key stops working")
    void revokeMigratedKeyRevokesRow() {
        String raw = "raw-9";
        ApiKey shadow = key(9, 1, true, null);
        when(apiKeyRepository.findByKeyHash(ApiKeyHasher.hash(raw)))
                .thenReturn(Optional.of(shadow));

        service.revokeMigratedKey(raw);

        assertThat(shadow.isEnabled()).isFalse();
        assertThat(shadow.getRevokedAt()).isNotNull();
        verify(apiKeyRepository).save(shadow);
    }
}
