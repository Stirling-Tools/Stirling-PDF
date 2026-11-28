package stirling.software.proprietary.mcp.oauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.security.KeyPairGenerator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.slf4j.MDC;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.audit.AuditAspect;
import stirling.software.proprietary.audit.ControllerAuditAspect;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.config.CustomAuditEventRepository;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.model.JwtVerificationKey;
import stirling.software.proprietary.security.service.KeyPersistenceServiceInterface;
import stirling.software.proprietary.service.AuditService;

import tools.jackson.databind.json.JsonMapper;

class McpOAuthAuditTest {

    @AfterEach
    void clearRequestContext() {
        RequestContextHolder.resetRequestAttributes();
        MDC.clear();
    }

    @ParameterizedTest
    @ValueSource(strings = {"authorization_code", "refresh_token"})
    void tokenExchangeNeverPersistsCredentialsWithVerboseResultCapture(String grantType)
            throws Exception {
        var properties = new ApplicationProperties();
        var audit = properties.getPremium().getEnterpriseFeatures().getAudit();
        audit.setEnabled(true);
        audit.setLevel(3);
        audit.setCaptureOperationResults(true);
        var config = new AuditConfigurationProperties(properties);
        var persisted = mock(PersistentAuditEventRepository.class);
        var writer = new CustomAuditEventRepository(persisted, JsonMapper.builder().build());
        var service = new AuditService(writer, config, true, null, null);

        var keys = mock(KeyPersistenceServiceInterface.class);
        var generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        var keyPair = generator.generateKeyPair();
        String keyId = "jwt-key-2026-11-02-193000-12345678";
        when(keys.getActiveKey()).thenReturn(new JwtVerificationKey(keyId, ""));
        when(keys.getKeyPair(keyId)).thenReturn(Optional.of(keyPair));
        String accessToken =
                new McpTokenMinter(keys)
                        .mintAccessToken(
                                "https://pdf.example.com",
                                "alice",
                                "https://pdf.example.com/mcp",
                                "mcp.tools.read mcp.tools.write offline_access",
                                "client-id",
                                1,
                                60);
        String refreshToken = "returned-refresh-token-secret";
        Map<String, Object> tokens = new LinkedHashMap<>();
        tokens.put("access_token", accessToken);
        tokens.put("token_type", "Bearer");
        tokens.put("expires_in", 3600);
        tokens.put("refresh_token", refreshToken);
        var oauth = mock(McpOAuthService.class);
        String code = "authorization-code-secret";
        String verifier = "pkce-verifier-secret";
        String oldRefreshToken = "request-refresh-token-secret";
        if ("authorization_code".equals(grantType)) {
            when(oauth.exchangeCode(code, "client-id", "https://client.example/callback", verifier))
                    .thenReturn(tokens);
        } else {
            when(oauth.refresh(oldRefreshToken, "client-id")).thenReturn(tokens);
        }
        var target = new McpOAuthController(oauth, mock(McpOAuthRegistrationLimiter.class));
        var factory = new AspectJProxyFactory(target);
        factory.addAspect(new ControllerAuditAspect(service, config));
        factory.addAspect(new AuditAspect(service, config));
        McpOAuthController controller = factory.getProxy();

        var request = new MockHttpServletRequest("POST", McpOAuthController.TOKEN_PATH);
        request.setContentType(MediaType.APPLICATION_FORM_URLENCODED_VALUE);
        request.addParameter("grant_type", grantType);
        request.addParameter("code", code);
        request.addParameter("code_verifier", verifier);
        request.addParameter("refresh_token", oldRefreshToken);
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(request, new MockHttpServletResponse()));

        var response =
                controller.token(
                        grantType,
                        code,
                        "client-id",
                        "https://client.example/callback",
                        verifier,
                        oldRefreshToken,
                        null);

        assertThat(response.getBody()).containsAllEntriesOf(tokens);
        var captor = ArgumentCaptor.forClass(PersistentAuditEvent.class);
        verify(persisted).save(captor.capture());
        assertThat(captor.getValue().getData())
                .contains("success")
                .doesNotContain(accessToken, refreshToken, code, verifier, oldRefreshToken);
    }
}
