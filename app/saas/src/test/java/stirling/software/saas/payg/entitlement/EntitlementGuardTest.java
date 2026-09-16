package stirling.software.saas.payg.entitlement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.method.HandlerMethod;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.payg.cap.RequiresFeature;
import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;
import stirling.software.saas.security.EnhancedJwtAuthenticationToken;
import stirling.software.saas.usage.GuestToolUsageService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Pure-Mockito tests for {@link EntitlementGuard}. Covers the four decision-matrix cells: anonymous
 * billable → 401, anonymous manual → pass, authenticated FULL → pass, authenticated DEGRADED for a
 * billable route → 402.
 */
class EntitlementGuardTest {

    private EntitlementService entitlementService;
    private UserRepository userRepository;
    private MeterRegistry meterRegistry;
    private EntitlementGuard guard;
    private GuestToolUsageService guestUsage;

    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void setUp() {
        entitlementService = Mockito.mock(EntitlementService.class);
        userRepository = Mockito.mock(UserRepository.class);
        meterRegistry = new SimpleMeterRegistry();
        guestUsage = Mockito.mock(GuestToolUsageService.class);
        guard = new EntitlementGuard(entitlementService, userRepository, meterRegistry, guestUsage);
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // ---------------------------------------------------------------------------------------
    // Scope: non-AutoJobPostMapping routes skip the guard entirely
    // ---------------------------------------------------------------------------------------

    @Test
    void nonHandlerMethod_passesThrough() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, "someRawHandler");

        assertThat(proceed).isTrue();
        assertThat(res.getStatus()).isEqualTo(200);
    }

    @Test
    void routeWithNeitherAnnotation_isSkipped() throws Exception {
        HandlerMethod hm = handlerFor("plainEndpoint");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isTrue();
        Mockito.verifyNoInteractions(entitlementService, userRepository);
    }

    @Test
    void routeWithRequiresFeatureButNoAutoJobPostMapping_isInScope() throws Exception {
        // Regression: @RequiresFeature alone (e.g. JSON-bodied AI controllers) must be in-scope.
        // Previously the guard short-circuited unless @AutoJobPostMapping was present, which meant
        // a team without AI entitlement could hit /api/v1/ai/* freely.
        UUID supabaseId = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(jwtAuth(supabaseId));
        when(userRepository.findBySupabaseId(supabaseId))
                .thenReturn(Optional.of(userWithTeam(7L, 42L)));
        when(entitlementService.getSnapshot(42L)).thenReturn(degradedSnapshot());

        HandlerMethod hm = handlerFor("aiOnlyNoAutoJobPostMapping");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isFalse();
        assertThat(res.getStatus()).isEqualTo(402);
        JsonNode body = json.readTree(res.getContentAsByteArray());
        assertThat(body.get("error").asText()).isEqualTo("FEATURE_DEGRADED");
        assertThat(body.get("missingGates").get(0).asText()).isEqualTo("AI_SUPPORT");
        verify(entitlementService).getSnapshot(42L);
    }

    @Test
    void routeWithClassLevelRequiresFeatureOnly_isInScope() throws Exception {
        // Mirrors AiCreateController shape: @RequiresFeature lives on the @RestController class,
        // not the method. Must still be picked up by the guard.
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new AnonymousAuthenticationToken(
                                "key",
                                "anonymousUser",
                                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));

        HandlerMethod hm = handlerForClassLevel("classLevelAiMethod");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isFalse();
        assertThat(res.getStatus()).isEqualTo(401);
        JsonNode body = json.readTree(res.getContentAsByteArray());
        assertThat(body.get("error").asText()).isEqualTo("SIGNUP_REQUIRED");
        assertThat(body.get("category").asText()).isEqualTo("AI");
    }

    @Test
    void aiToolRoute_noAnnotation_isInScopeAndGatedOnAiSupport() throws Exception {
        // /api/v1/ai/tools/** controllers live in the proprietary module and carry no
        // @RequiresFeature; the guard recognises them by path and gates on AI_SUPPORT. A degraded
        // team is 402'd even though the handler has no annotation.
        UUID supabaseId = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(jwtAuth(supabaseId));
        when(userRepository.findBySupabaseId(supabaseId))
                .thenReturn(Optional.of(userWithTeam(7L, 42L)));
        when(entitlementService.getSnapshot(42L)).thenReturn(degradedSnapshot());

        HandlerMethod hm = handlerFor("plainEndpoint"); // no annotations
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRequestURI("/api/v1/ai/tools/pdf-comment-agent");
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isFalse();
        assertThat(res.getStatus()).isEqualTo(402);
        JsonNode body = json.readTree(res.getContentAsByteArray());
        assertThat(body.get("error").asText()).isEqualTo("FEATURE_DEGRADED");
        assertThat(body.get("missingGates").get(0).asText()).isEqualTo("AI_SUPPORT");
        verify(entitlementService).getSnapshot(42L);
    }

    @Test
    void aiToolRoute_anonymous_returns401WithAiCategory() throws Exception {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new AnonymousAuthenticationToken(
                                "key",
                                "anonymousUser",
                                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));

        HandlerMethod hm = handlerFor("plainEndpoint");
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRequestURI("/api/v1/ai/tools/math-auditor-agent");
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isFalse();
        assertThat(res.getStatus()).isEqualTo(401);
        JsonNode body = json.readTree(res.getContentAsByteArray());
        assertThat(body.get("error").asText()).isEqualTo("SIGNUP_REQUIRED");
        assertThat(body.get("category").asText()).isEqualTo("AI");
    }

    // ---------------------------------------------------------------------------------------
    // Policy execute routes (proprietary; recognised by path, gated on AUTOMATION)
    // ---------------------------------------------------------------------------------------

    @Test
    void policyRunRoute_noAnnotation_isInScopeAndGatedOnAutomation() throws Exception {
        UUID supabaseId = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(jwtAuth(supabaseId));
        when(userRepository.findBySupabaseId(supabaseId))
                .thenReturn(Optional.of(userWithTeam(7L, 42L)));
        when(entitlementService.getSnapshot(42L)).thenReturn(degradedSnapshot());

        HandlerMethod hm = handlerFor("plainEndpoint"); // no annotations
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRequestURI("/api/v1/policies/pol-123/run");
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isFalse();
        assertThat(res.getStatus()).isEqualTo(402);
        JsonNode body = json.readTree(res.getContentAsByteArray());
        assertThat(body.get("error").asText()).isEqualTo("FEATURE_DEGRADED");
        assertThat(body.get("missingGates").get(0).asText()).isEqualTo("AUTOMATION");
        verify(entitlementService).getSnapshot(42L);
    }

    @Test
    void policyRunRoute_anonymous_returns401WithAutomationCategory() throws Exception {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new AnonymousAuthenticationToken(
                                "key",
                                "anonymousUser",
                                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));

        HandlerMethod hm = handlerFor("plainEndpoint");
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRequestURI("/api/v1/policies/pol-123/trigger");
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isFalse();
        assertThat(res.getStatus()).isEqualTo(401);
        JsonNode body = json.readTree(res.getContentAsByteArray());
        assertThat(body.get("error").asText()).isEqualTo("SIGNUP_REQUIRED");
        assertThat(body.get("category").asText()).isEqualTo("AUTOMATION");
    }

    @Test
    void policyRunRoute_authenticatedFull_passesThrough() throws Exception {
        UUID supabaseId = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(jwtAuth(supabaseId));
        when(userRepository.findBySupabaseId(supabaseId))
                .thenReturn(Optional.of(userWithTeam(7L, 42L)));
        when(entitlementService.getSnapshot(42L)).thenReturn(fullSnapshot());

        HandlerMethod hm = handlerFor("plainEndpoint");
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRequestURI("/api/v1/policies/run");
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isTrue();
        assertThat(res.getStatus()).isEqualTo(200);
    }

    @Test
    void policyReadRoute_notGated_passesThroughEvenDegraded() throws Exception {
        // Listing policies must stay ungated so the UI can show them and prompt on use.
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new AnonymousAuthenticationToken(
                                "key",
                                "anonymousUser",
                                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));

        HandlerMethod hm = handlerFor("plainEndpoint");
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRequestURI("/api/v1/policies");
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isTrue();
        assertThat(res.getStatus()).isEqualTo(200);
        Mockito.verifyNoInteractions(entitlementService);
    }

    // ---------------------------------------------------------------------------------------
    // Anonymous user
    // ---------------------------------------------------------------------------------------

    @Test
    void anonymousUser_billableRoute_returns401SignupRequired() throws Exception {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new AnonymousAuthenticationToken(
                                "key",
                                "anonymousUser",
                                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));

        HandlerMethod hm = handlerFor("automationOnly");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isFalse();
        assertThat(res.getStatus()).isEqualTo(401);
        assertThat(res.getContentType()).startsWith(MediaType.APPLICATION_JSON_VALUE);
        JsonNode body = json.readTree(res.getContentAsByteArray());
        assertThat(body.get("error").asText()).isEqualTo("SIGNUP_REQUIRED");
        assertThat(body.get("category").asText()).isEqualTo("AUTOMATION");
        Mockito.verifyNoInteractions(entitlementService);
    }

    @Test
    void anonymousUser_aiRoute_returns401WithAiCategory() throws Exception {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new AnonymousAuthenticationToken(
                                "key",
                                "anonymousUser",
                                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));

        HandlerMethod hm = handlerFor("aiOnly");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isFalse();
        JsonNode body = json.readTree(res.getContentAsByteArray());
        assertThat(body.get("category").asText()).isEqualTo("AI");
    }

    @Test
    void anonymousUser_withoutGuestAccount_mustSignIn() throws Exception {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new AnonymousAuthenticationToken(
                                "key",
                                "anonymousUser",
                                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));

        HandlerMethod hm = handlerFor("manualTool");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isFalse();
        assertThat(res.getStatus()).isEqualTo(401);
        Mockito.verifyNoInteractions(entitlementService);
    }

    // ---------------------------------------------------------------------------------------
    // Authenticated user — FULL vs DEGRADED
    // ---------------------------------------------------------------------------------------

    @Test
    void authenticatedUser_fullState_passesThrough() throws Exception {
        UUID supabaseId = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(jwtAuth(supabaseId));
        when(userRepository.findBySupabaseId(supabaseId))
                .thenReturn(Optional.of(userWithTeam(7L, 42L)));
        when(entitlementService.getSnapshot(42L)).thenReturn(fullSnapshot());

        HandlerMethod hm = handlerFor("automationOnly");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isTrue();
        assertThat(res.getStatus()).isEqualTo(200);
    }

    @Test
    void authenticatedUser_degradedAndBillable_returns402() throws Exception {
        UUID supabaseId = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(jwtAuth(supabaseId));
        when(userRepository.findBySupabaseId(supabaseId))
                .thenReturn(Optional.of(userWithTeam(7L, 42L)));
        when(entitlementService.getSnapshot(42L)).thenReturn(degradedSnapshot());

        HandlerMethod hm = handlerFor("automationOnly");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isFalse();
        assertThat(res.getStatus()).isEqualTo(402);
        assertThat(res.getContentType()).startsWith(MediaType.APPLICATION_JSON_VALUE);
        JsonNode body = json.readTree(res.getContentAsByteArray());
        assertThat(body.get("error").asText()).isEqualTo("FEATURE_DEGRADED");
        assertThat(body.get("state").asText()).isEqualTo("DEGRADED");
        // subscribed drives the client's modal choice (free-limit vs spend-cap).
        assertThat(body.get("subscribed").asBoolean()).isFalse();
        assertThat(body.get("capUnits").asLong()).isEqualTo(500L);
        assertThat(body.get("spendUnits").asLong()).isEqualTo(500L);
        assertThat(body.get("missingGates").isArray()).isTrue();
        assertThat(body.get("missingGates").get(0).asText()).isEqualTo("AUTOMATION");
    }

    @Test
    void authenticatedUser_degradedButManualTool_passesThrough() throws Exception {
        // KEY assertion: DEGRADED+MINIMAL must still allow manual server tools (OFFSITE_PROCESSING)
        // — that's the whole point of moving OFFSITE into MINIMAL.
        UUID supabaseId = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(jwtAuth(supabaseId));
        when(userRepository.findBySupabaseId(supabaseId))
                .thenReturn(Optional.of(userWithTeam(7L, 42L)));
        when(entitlementService.getSnapshot(42L)).thenReturn(degradedSnapshot());

        HandlerMethod hm = handlerFor("manualTool");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isTrue();
        assertThat(res.getStatus()).isEqualTo(200);
    }

    @Test
    void authenticatedUser_aiRouteDegraded_returns402() throws Exception {
        UUID supabaseId = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(jwtAuth(supabaseId));
        when(userRepository.findBySupabaseId(supabaseId))
                .thenReturn(Optional.of(userWithTeam(7L, 42L)));
        when(entitlementService.getSnapshot(42L)).thenReturn(degradedSnapshot());

        HandlerMethod hm = handlerFor("aiOnly");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isFalse();
        assertThat(res.getStatus()).isEqualTo(402);
        JsonNode body = json.readTree(res.getContentAsByteArray());
        assertThat(body.get("missingGates").get(0).asText()).isEqualTo("AI_SUPPORT");
    }

    // ---------------------------------------------------------------------------------------
    // API-key calls: billable, hard-stop when degraded (allowance/cap reached)
    // ---------------------------------------------------------------------------------------

    @Test
    void apiKeyCall_degradedFreeTeam_returns402AndAdvisesSubscribe() throws Exception {
        // A plain server tool (OFFSITE_PROCESSING) reached via API key: the gate survives DEGRADED,
        // so the gate loop would wave it through — but API usage is billable and must hard-stop
        // once the free allowance is spent.
        SecurityContextHolder.getContext().setAuthentication(apiKeyAuth(42L));
        when(entitlementService.getSnapshot(42L)).thenReturn(degradedSnapshot(false));

        HandlerMethod hm = handlerFor("manualTool"); // OFFSITE default gate
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isFalse();
        assertThat(res.getStatus()).isEqualTo(402);
        JsonNode body = json.readTree(res.getContentAsByteArray());
        assertThat(body.get("error").asText()).isEqualTo("PAYG_LIMIT_REACHED");
        assertThat(body.get("subscribed").asBoolean()).isFalse();
        assertThat(body.get("message").asText()).contains("Subscribe");
    }

    @Test
    void apiKeyCall_degradedSubscribedTeam_returns402AndAdvisesCap() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(apiKeyAuth(42L));
        when(entitlementService.getSnapshot(42L)).thenReturn(degradedSnapshot(true));

        HandlerMethod hm = handlerFor("manualTool");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isFalse();
        assertThat(res.getStatus()).isEqualTo(402);
        JsonNode body = json.readTree(res.getContentAsByteArray());
        assertThat(body.get("error").asText()).isEqualTo("PAYG_LIMIT_REACHED");
        assertThat(body.get("subscribed").asBoolean()).isTrue();
        assertThat(body.get("message").asText()).contains("cap");
    }

    @Test
    void apiKeyCall_withinAllowance_passes() throws Exception {
        // Not degraded → API usage under the free allowance proceeds normally.
        SecurityContextHolder.getContext().setAuthentication(apiKeyAuth(42L));
        when(entitlementService.getSnapshot(42L)).thenReturn(fullSnapshot());

        HandlerMethod hm = handlerFor("manualTool");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isTrue();
        assertThat(res.getStatus()).isEqualTo(200);
    }

    @Test
    void jwtWebManualTool_degraded_stillPasses() throws Exception {
        // The "allow JWT web tool usage" guarantee: a web (JWT) user running an everyday server
        // tool (OFFSITE_PROCESSING) is NOT blocked when the team is over allowance — only billable
        // API/AI/automation calls hard-stop. (Web manual calls are BillingCategory.BYPASSED.)
        UUID supabaseId = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(jwtAuth(supabaseId));
        when(userRepository.findBySupabaseId(supabaseId))
                .thenReturn(Optional.of(userWithTeam(7L, 42L)));
        when(entitlementService.getSnapshot(42L)).thenReturn(degradedSnapshot(false));

        HandlerMethod hm = handlerFor("manualTool"); // OFFSITE — survives DEGRADED
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isTrue();
        assertThat(res.getStatus()).isEqualTo(200);
    }

    // ---------------------------------------------------------------------------------------
    // Fail-open
    // ---------------------------------------------------------------------------------------

    @Test
    void snapshotLookupThrows_failsOpenAndPasses() throws Exception {
        UUID supabaseId = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(jwtAuth(supabaseId));
        when(userRepository.findBySupabaseId(supabaseId))
                .thenReturn(Optional.of(userWithTeam(7L, 42L)));
        when(entitlementService.getSnapshot(42L))
                .thenThrow(new RuntimeException("transient DB outage"));

        HandlerMethod hm = handlerFor("automationOnly");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isTrue();
        assertThat(res.getStatus()).isEqualTo(200);
    }

    @Test
    void noTeam_passesThrough() throws Exception {
        UUID supabaseId = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(jwtAuth(supabaseId));
        User u = new User();
        u.setId(7L);
        u.setTeam(null);
        when(userRepository.findBySupabaseId(supabaseId)).thenReturn(Optional.of(u));

        HandlerMethod hm = handlerFor("automationOnly");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isTrue();
        verify(entitlementService, never()).getSnapshot(any());
    }

    // ---------------------------------------------------------------------------------------
    // resolveRequiredGates fallback
    // ---------------------------------------------------------------------------------------

    @Test
    void resolveRequiredGates_noAnnotation_defaultsToOffsiteProcessing() throws Exception {
        HandlerMethod hm = handlerFor("manualTool");
        FeatureGate[] gates = EntitlementGuard.resolveRequiredGates(hm);
        assertThat(gates).containsExactly(FeatureGate.OFFSITE_PROCESSING);
    }

    @Test
    void resolveRequiredGates_withAnnotation_usesAnnotationValue() throws Exception {
        HandlerMethod hm = handlerFor("automationOnly");
        FeatureGate[] gates = EntitlementGuard.resolveRequiredGates(hm);
        assertThat(gates).containsExactly(FeatureGate.AUTOMATION);
    }

    // ---------------------------------------------------------------------------------------
    // Helpers / fixture controller
    // ---------------------------------------------------------------------------------------

    private static EntitlementSnapshot fullSnapshot() {
        return new EntitlementSnapshot(
                EntitlementState.FULL,
                FeatureSet.FULL,
                List.of(
                        FeatureGate.OFFSITE_PROCESSING,
                        FeatureGate.AUTOMATION,
                        FeatureGate.AI_SUPPORT,
                        FeatureGate.CLIENT_SIDE),
                0L,
                500L,
                LocalDateTime.of(2026, 6, 1, 0, 0),
                LocalDateTime.of(2026, 7, 1, 0, 0),
                false);
    }

    private static EntitlementSnapshot degradedSnapshot() {
        return degradedSnapshot(false);
    }

    private static EntitlementSnapshot degradedSnapshot(boolean subscribed) {
        return new EntitlementSnapshot(
                EntitlementState.DEGRADED,
                FeatureSet.MINIMAL,
                List.of(FeatureGate.OFFSITE_PROCESSING, FeatureGate.CLIENT_SIDE),
                500L,
                500L,
                LocalDateTime.of(2026, 6, 1, 0, 0),
                LocalDateTime.of(2026, 7, 1, 0, 0),
                subscribed);
    }

    private static ApiKeyAuthenticationToken apiKeyAuth(long teamId) {
        User u = userWithTeam(99L, teamId);
        return new ApiKeyAuthenticationToken(
                u, "sk-test", List.of(new SimpleGrantedAuthority("ROLE_USER")));
    }

    private static User userWithTeam(long userId, long teamId) {
        User u = new User();
        u.setId(userId);
        Team t = new Team();
        t.setId(teamId);
        u.setTeam(t);
        return u;
    }

    @Test
    void supabaseGuestCannotUseProcessorEvenWithExistingTeam() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(guestAuth(UUID.randomUUID()));
        MockHttpServletResponse response = new MockHttpServletResponse();
        assertThat(guard.preHandle(new MockHttpServletRequest(), response, handlerFor("aiOnly")))
                .isFalse();
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(json.readTree(response.getContentAsString()).get("error").asText())
                .isEqualTo("SIGNUP_REQUIRED");
        Mockito.verifyNoInteractions(guestUsage, entitlementService, userRepository);
    }

    @Test
    void supabaseGuestLimitReturnsSignupWithoutBilling() throws Exception {
        UUID id = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(guestAuth(id));
        when(userRepository.findBySupabaseId(id)).thenReturn(Optional.of(userWithTeam(7L, 42L)));
        when(guestUsage.limit()).thenReturn(5);
        MockHttpServletResponse response = new MockHttpServletResponse();
        assertThat(
                        guard.preHandle(
                                new MockHttpServletRequest(), response, handlerFor("manualTool")))
                .isFalse();
        JsonNode body = json.readTree(response.getContentAsString());
        assertThat(body.get("reason").asText()).isEqualTo("GUEST_TOOL_LIMIT_REACHED");
        assertThat(body.get("limit").asInt()).isEqualTo(5);
        Mockito.verifyNoInteractions(entitlementService);
    }

    @Test
    void guestFailureRefundsOnceAcrossAsyncRedispatch() throws Exception {
        UUID id = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(guestAuth(id));
        when(userRepository.findBySupabaseId(id)).thenReturn(Optional.of(userWithTeam(7L, 42L)));
        when(guestUsage.reserve(7L)).thenReturn(true);
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        HandlerMethod handler = handlerFor("manualTool");
        assertThat(guard.preHandle(request, response, handler)).isTrue();
        assertThat(guard.preHandle(request, response, handler)).isTrue();
        response.setStatus(500);
        guard.afterCompletion(request, response, handler, null);
        guard.afterCompletion(request, response, handler, null);
        verify(guestUsage).reserve(7L);
        verify(guestUsage).release(7L);
    }

    @Test
    void guestSuccessKeepsItsSlot() throws Exception {
        UUID id = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(guestAuth(id));
        when(userRepository.findBySupabaseId(id)).thenReturn(Optional.of(userWithTeam(7L, 42L)));
        when(guestUsage.reserve(7L)).thenReturn(true);
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        HandlerMethod handler = handlerFor("manualTool");
        assertThat(guard.preHandle(request, response, handler)).isTrue();
        guard.afterCompletion(request, response, handler, null);
        verify(guestUsage, never()).release(any());
    }

    private static EnhancedJwtAuthenticationToken guestAuth(UUID id) {
        Jwt jwt =
                new Jwt(
                        "token",
                        Instant.now(),
                        Instant.now().plusSeconds(3600),
                        Map.of("alg", "RS256"),
                        Map.of("sub", id.toString(), "is_anonymous", true));
        return new EnhancedJwtAuthenticationToken(
                jwt,
                List.of(new SimpleGrantedAuthority("ROLE_LIMITED_API_USER")),
                "anon_" + id,
                id.toString());
    }

    @Test
    void guestCannotMintLegacyApiKey() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(guestAuth(UUID.randomUUID()));
        Class<stirling.software.proprietary.security.controller.api.UserController> type =
                stirling.software.proprietary.security.controller.api.UserController.class;
        HandlerMethod handler =
                new HandlerMethod(
                        Mockito.mock(type),
                        type.getMethod("updateApiKey", java.security.Principal.class));
        MockHttpServletResponse response = new MockHttpServletResponse();
        assertThat(guard.preHandle(new MockHttpServletRequest(), response, handler)).isFalse();
        assertThat(json.readTree(response.getContentAsString()).get("category").asText())
                .isEqualTo("API");
        Mockito.verifyNoInteractions(guestUsage, entitlementService);
    }

    @Test
    void guestCannotBypassProcessorGateWithAutomationHeader() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(guestAuth(UUID.randomUUID()));
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Stirling-Automation", "true");
        MockHttpServletResponse response = new MockHttpServletResponse();
        assertThat(guard.preHandle(request, response, handlerFor("plainEndpoint"))).isFalse();
        assertThat(response.getStatus()).isEqualTo(401);
        Mockito.verifyNoInteractions(guestUsage, entitlementService);
    }

    @Test
    void guestQuotaFailureDoesNotAdmitUnmeteredWork() throws Exception {
        UUID id = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(guestAuth(id));
        when(userRepository.findBySupabaseId(id)).thenReturn(Optional.of(userWithTeam(7L, 42L)));
        when(guestUsage.reserve(7L)).thenThrow(new IllegalStateException("database unavailable"));
        MockHttpServletResponse response = new MockHttpServletResponse();
        assertThat(
                        guard.preHandle(
                                new MockHttpServletRequest(), response, handlerFor("manualTool")))
                .isFalse();
        assertThat(response.getStatus()).isEqualTo(503);
    }

    private static EnhancedJwtAuthenticationToken jwtAuth(UUID supabaseId) {
        Map<String, Object> headers = new HashMap<>();
        headers.put("alg", "RS256");
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", supabaseId.toString());
        claims.put("email", "user@example.com");
        Jwt jwt = new Jwt("token", Instant.now(), Instant.now().plusSeconds(3600), headers, claims);
        return new EnhancedJwtAuthenticationToken(
                jwt,
                List.of(new SimpleGrantedAuthority("ROLE_USER")),
                "user@example.com",
                supabaseId.toString());
    }

    private static HandlerMethod handlerFor(String methodName) throws NoSuchMethodException {
        Method m = TestController.class.getDeclaredMethod(methodName);
        return new HandlerMethod(new TestController(), m);
    }

    private static HandlerMethod handlerForClassLevel(String methodName)
            throws NoSuchMethodException {
        Method m = ClassLevelAiController.class.getDeclaredMethod(methodName);
        return new HandlerMethod(new ClassLevelAiController(), m);
    }

    /** Fixture mounting route shapes the guard's resolver needs to discriminate. */
    static class TestController {

        @AutoJobPostMapping("/manual")
        public String manualTool() {
            return "ok";
        }

        @AutoJobPostMapping("/automation")
        @RequiresFeature(FeatureGate.AUTOMATION)
        public String automationOnly() {
            return "ok";
        }

        @AutoJobPostMapping("/ai")
        @RequiresFeature(FeatureGate.AI_SUPPORT)
        public String aiOnly() {
            return "ok";
        }

        /** Endpoint without any annotation — guard must skip. */
        public String plainEndpoint() {
            return "ok";
        }

        /** AI-controller shape: @RequiresFeature with NO @AutoJobPostMapping (JSON body). */
        @RequiresFeature(FeatureGate.AI_SUPPORT)
        public String aiOnlyNoAutoJobPostMapping() {
            return "ok";
        }
    }

    /**
     * Mirrors {@code AiCreateController} layout: @RequiresFeature on the class, plain methods. The
     * guard must pick up the class-level annotation.
     */
    @RequiresFeature(FeatureGate.AI_SUPPORT)
    static class ClassLevelAiController {
        public String classLevelAiMethod() {
            return "ok";
        }
    }
}
