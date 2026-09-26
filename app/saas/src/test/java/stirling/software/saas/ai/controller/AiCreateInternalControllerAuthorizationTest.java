package stirling.software.saas.ai.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.proprietary.security.controller.api.SecurityExceptionHandler;
import stirling.software.saas.ai.model.AiCreateSession;
import stirling.software.saas.ai.model.AiCreateSessionStatus;
import stirling.software.saas.ai.service.AiCreateSessionService;

/**
 * Sends requests through the method-security proxy and the production {@link
 * SecurityExceptionHandler}, so a missing gate cannot hide behind a direct call to the controller.
 */
class AiCreateInternalControllerAuthorizationTest {

    private static final String SESSION_URL = "/api/v1/ai/create/internal/sessions/victim-session";
    private static final String UPDATE_BODY = "{\"pdfUrl\":\"https://files.example/doc.pdf\"}";

    // What SupabaseSecurityConfig.toAuthentication grants any signed-in SaaS user.
    private static final String[] SIGNED_IN_USER = {"ROLE_authenticated", "ROLE_USER"};

    @Configuration(proxyBeanMethods = false)
    @EnableMethodSecurity
    static class SecurityConfig {}

    private AnnotationConfigApplicationContext context;
    private AiCreateSessionService sessionService;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        sessionService = mock(AiCreateSessionService.class);
        context = new AnnotationConfigApplicationContext();
        // The controller is @Profile("saas"); without it registerBean silently skips the bean.
        context.getEnvironment().setActiveProfiles("saas");
        context.register(SecurityConfig.class);
        context.registerBean(
                AiCreateInternalController.class,
                () -> new AiCreateInternalController(sessionService));
        context.refresh();
        mvc =
                MockMvcBuilders.standaloneSetup(context.getBean(AiCreateInternalController.class))
                        .setControllerAdvice(new SecurityExceptionHandler())
                        .build();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        context.close();
    }

    @Test
    void signedInUserCannotReadAnotherUsersSession() throws Exception {
        authenticate(SIGNED_IN_USER);

        mvc.perform(get(SESSION_URL)).andExpect(status().isForbidden());

        verifyNoInteractions(sessionService);
    }

    @Test
    void signedInUserCannotOverwriteAnotherUsersSession() throws Exception {
        authenticate(SIGNED_IN_USER);

        mvc.perform(
                        post(SESSION_URL + "/update")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(UPDATE_BODY))
                .andExpect(status().isForbidden());

        verifyNoInteractions(sessionService);
    }

    @Test
    void adminCanReadAndUpdateAnySession() throws Exception {
        authenticate("ROLE_ADMIN");
        AiCreateSession session = new AiCreateSession();
        session.setSessionId("victim-session");
        session.setUserId("victim");
        session.setStatus(AiCreateSessionStatus.DRAFT_READY);
        when(sessionService.getSession("victim-session")).thenReturn(session);
        when(sessionService.applyInternalUpdate(
                        any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                        any()))
                .thenReturn(session);

        mvc.perform(get(SESSION_URL)).andExpect(status().isOk());
        mvc.perform(
                        post(SESSION_URL + "/update")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(UPDATE_BODY))
                .andExpect(status().isOk());

        verify(sessionService).getSession("victim-session");
        verify(sessionService)
                .applyInternalUpdate(
                        "victim-session",
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        "https://files.example/doc.pdf",
                        null,
                        null,
                        null);
    }

    private static void authenticate(String... authorities) {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                "caller", null, AuthorityUtils.createAuthorityList(authorities)));
    }
}
