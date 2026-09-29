package stirling.software.proprietary.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.concurrent.Executor;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authorization.method.AuthorizationManagerBeforeMethodInterceptor;
import org.springframework.security.authorization.method.PreAuthorizeAuthorizationManager;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.TaskManager;
import stirling.software.proprietary.model.api.ai.AiEngineStatus;
import stirling.software.proprietary.service.AiEngineClient;
import stirling.software.proprietary.service.AiEngineEndpointResolver;
import stirling.software.proprietary.service.AiEngineRouter;
import stirling.software.proprietary.service.AiFeatureGate;
import stirling.software.proprietary.service.AiWorkflowService;
import stirling.software.proprietary.service.CloudStatusProbe;

import tools.jackson.databind.json.JsonMapper;

/**
 * The status card's endpoint fans out to the engine (and to Stirling Cloud in cloud mode), so it is
 * admin-only and every probe carries a short timeout.
 */
class AiEngineControllerStatusTest {

    private AiEngineClient engine;
    private AiEngineRouter router;
    private CloudStatusProbe cloudProbe;
    private AiEngineController controller;

    @BeforeEach
    void setUp() throws Exception {
        ApplicationProperties props = new ApplicationProperties();
        props.getAiEngine().setEnabled(true);
        engine = mock(AiEngineClient.class);
        router = mock(AiEngineRouter.class);
        cloudProbe = mock(CloudStatusProbe.class);
        when(engine.get(eq("/health"), any(), any()))
                .thenReturn("{\"smartModel\":\"smart\",\"fastModel\":\"fast\"}");
        when(engine.get(eq("/api/v1/agents/capabilities"), any(), any())).thenReturn("{}");
        when(engine.get(eq("/status"), any(), any())).thenReturn("{\"sharingEnabled\":true}");
        controller =
                new AiEngineController(
                        engine,
                        mock(AiWorkflowService.class),
                        JsonMapper.builder().build(),
                        mock(Executor.class),
                        mock(TaskManager.class),
                        mock(JobOwnershipService.class),
                        mock(AiEngineEndpointResolver.class),
                        mock(AiFeatureGate.class),
                        props,
                        router,
                        cloudProbe,
                        null);
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    private static void signInAs(String role) {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                "someone", "n/a", List.of(new SimpleGrantedAuthority(role))));
    }

    /** The controller behind the same @PreAuthorize interceptor Spring installs. */
    private AiEngineController secured() {
        ProxyFactory factory = new ProxyFactory(controller);
        factory.setProxyTargetClass(true);
        factory.addAdvisor(
                AuthorizationManagerBeforeMethodInterceptor.preAuthorize(
                        new PreAuthorizeAuthorizationManager()));
        return (AiEngineController) factory.getProxy();
    }

    @Test
    void statusRefusesUsersWhoAreNotAdmins() throws Exception {
        signInAs("ROLE_USER");

        assertThrows(AccessDeniedException.class, () -> secured().status());
        verify(engine, never()).get(anyString(), any(), any());
    }

    @Test
    void statusAnswersAdmins() {
        signInAs("ROLE_ADMIN");

        AiEngineStatus status = secured().status();

        assertTrue(status.isReachable());
        assertEquals("smart", status.getSmartModel());
        assertEquals(Boolean.TRUE, status.getAuthenticated());
    }

    @Test
    void selfHostedProbesUseTheShortTimeout() throws Exception {
        controller.status();

        verify(engine).get("/health", null, AiEngineController.PROBE_TIMEOUT);
        verify(engine).get("/api/v1/agents/capabilities", null, AiEngineController.PROBE_TIMEOUT);
        verify(engine, never()).get(anyString(), any());
    }

    @Test
    void cloudProbesUseTheShortTimeout() throws Exception {
        when(router.isCloudMode()).thenReturn(true);
        when(cloudProbe.isUp()).thenReturn(true);

        AiEngineStatus status = controller.status();

        assertEquals(Boolean.TRUE, status.getCloudSharingEnabled());
        verify(engine).get("/status", null, AiEngineController.PROBE_TIMEOUT);
        verify(engine).get("/health", null, AiEngineController.PROBE_TIMEOUT);
        verify(engine, never()).get(anyString(), any());
    }

    @Test
    void healthUsesTheShortTimeout() throws Exception {
        controller.health();

        verify(engine).get("/health", null, AiEngineController.PROBE_TIMEOUT);
    }
}
