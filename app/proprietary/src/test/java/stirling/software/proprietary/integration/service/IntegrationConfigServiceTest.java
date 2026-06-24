package stirling.software.proprietary.integration.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.access.model.DefaultAccessPolicy;
import stirling.software.proprietary.access.model.OwnerScope;
import stirling.software.proprietary.access.service.OwnershipService;
import stirling.software.proprietary.access.service.SecretMasker;
import stirling.software.proprietary.integration.dto.IntegrationConfigRequest;
import stirling.software.proprietary.integration.dto.IntegrationConfigResponse;
import stirling.software.proprietary.integration.model.IntegrationConfig;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.security.model.User;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * Integration-glue tests. Ownership authorization and secret masking are covered by {@code
 * OwnershipServiceTest} / {@code SecretMaskerTest}; here those collaborators are mocked and we
 * assert this service delegates to them correctly.
 */
@ExtendWith(MockitoExtension.class)
class IntegrationConfigServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Mock private IntegrationConfigRepository repository;
    @Mock private OwnershipService ownership;
    @Mock private SecretMasker secretMasker;

    @InjectMocks private IntegrationConfigService service;

    @Test
    void createDelegatesOwnershipAndSanitizesConfig() {
        when(secretMasker.sanitize(any())).thenReturn(Map.of("bucket", "b"));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        User user = user(7);

        IntegrationConfig created =
                service.create(request(IntegrationType.S3, OwnerScope.USER, null), user);

        assertThat(created.getIntegrationType()).isEqualTo(IntegrationType.S3);
        assertThat(created.getName()).isEqualTo("name");
        verify(ownership)
                .assignOwnership(eq(created), eq(OwnerScope.USER), isNull(), eq(user), any());
        verify(secretMasker).sanitize(any());
    }

    @Test
    void updateMergesConfigViaSecretMasker() throws Exception {
        IntegrationConfig cfg = config(2L);
        cfg.setConfig("{\"bucket\":\"old\",\"secretKey\":\"REAL\"}");
        when(repository.findById(2L)).thenReturn(Optional.of(cfg));
        when(ownership.canManage(any(), eq(cfg), any())).thenReturn(true);
        when(secretMasker.merge(any(), any()))
                .thenReturn(Map.of("bucket", "new", "secretKey", "REAL"));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        IntegrationConfigRequest req =
                new IntegrationConfigRequest(
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        Map.of("bucket", "new", "secretKey", "********"));
        service.update(2L, req, user(7));

        Map<String, Object> stored =
                MAPPER.readValue(cfg.getConfig(), new TypeReference<Map<String, Object>>() {});
        assertThat(stored.get("bucket")).isEqualTo("new");
        assertThat(stored.get("secretKey")).isEqualTo("REAL");
    }

    @Test
    void updateForbiddenWhenCannotManage() {
        IntegrationConfig cfg = config(3L);
        when(repository.findById(3L)).thenReturn(Optional.of(cfg));
        when(ownership.canManage(any(), eq(cfg), any())).thenReturn(false);

        assertThatThrownBy(
                        () ->
                                service.update(
                                        3L,
                                        request(IntegrationType.S3, OwnerScope.USER, null),
                                        user(7)))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void toResponseMasksConfig() {
        IntegrationConfig cfg = config(4L);
        cfg.setConfig("{\"secretKey\":\"x\"}");
        when(secretMasker.mask(any())).thenReturn(Map.of("secretKey", SecretMasker.MASK));
        when(ownership.canManage(any(), eq(cfg), any())).thenReturn(false);

        IntegrationConfigResponse resp = service.toResponse(cfg, user(7));

        assertThat(resp.config().get("secretKey")).isEqualTo(SecretMasker.MASK);
        assertThat(resp.canManage()).isFalse();
    }

    @Test
    void listIncludesAConfigSharedViaAnExplicitGrant() {
        User user = user(7);
        when(repository.findByOwnerUser(user)).thenReturn(List.of());
        when(repository.findByScope(OwnerScope.SERVER)).thenReturn(List.of());
        when(ownership.grantedResourceIds(any(), eq(user))).thenReturn(Set.of("99"));
        IntegrationConfig shared = config(99L);
        when(repository.findById(99L)).thenReturn(Optional.of(shared));
        when(ownership.canUse(any(), eq(shared), eq(user))).thenReturn(true);

        List<IntegrationConfig> visible = service.listVisible(user);

        assertThat(visible).extracting(IntegrationConfig::getId).contains(99L);
    }

    @Test
    void nonAdminCannotChangeLockedFlag() {
        IntegrationConfig cfg = config(5L); // locked = false
        when(repository.findById(5L)).thenReturn(Optional.of(cfg));
        when(ownership.canManage(any(), eq(cfg), any())).thenReturn(true);
        when(ownership.isAdmin(any())).thenReturn(false);

        IntegrationConfigRequest req =
                new IntegrationConfigRequest(null, null, null, null, null, true, null, null);

        assertThatThrownBy(() -> service.update(5L, req, user(7)))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    // ---- helpers ----

    private IntegrationConfig config(long id) {
        IntegrationConfig cfg = new IntegrationConfig();
        cfg.setId(id);
        cfg.setIntegrationType(IntegrationType.S3);
        cfg.setName("cfg" + id);
        cfg.setEnabled(true);
        cfg.setDefaultAccess(DefaultAccessPolicy.EXPLICIT_ONLY);
        return cfg;
    }

    private IntegrationConfigRequest request(IntegrationType type, OwnerScope scope, Long teamId) {
        return new IntegrationConfigRequest(
                type, "name", scope, teamId, null, null, null, Map.of("bucket", "b"));
    }

    private User user(long id) {
        User u = new User();
        u.setId(id);
        u.setUsername("user" + id);
        return u;
    }
}
