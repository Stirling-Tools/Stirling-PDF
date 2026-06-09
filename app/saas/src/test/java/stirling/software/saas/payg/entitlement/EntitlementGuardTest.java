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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.payg.cap.RequiresFeature;
import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;
import stirling.software.saas.security.EnhancedJwtAuthenticationToken;

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

    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void setUp() {
        entitlementService = Mockito.mock(EntitlementService.class);
        userRepository = Mockito.mock(UserRepository.class);
        meterRegistry = new SimpleMeterRegistry();
        guard = new EntitlementGuard(entitlementService, userRepository, meterRegistry);
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
    void routeWithoutAutoJobPostMapping_isSkipped() throws Exception {
        HandlerMethod hm = handlerFor("plainEndpoint");
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean proceed = guard.preHandle(req, res, hm);

        assertThat(proceed).isTrue();
        Mockito.verifyNoInteractions(entitlementService, userRepository);
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
    void anonymousUser_manualTool_passesThroughUnbilled() throws Exception {
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

        assertThat(proceed).isTrue();
        assertThat(res.getStatus()).isEqualTo(200);
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
                LocalDateTime.of(2026, 7, 1, 0, 0));
    }

    private static EntitlementSnapshot degradedSnapshot() {
        return new EntitlementSnapshot(
                EntitlementState.DEGRADED,
                FeatureSet.MINIMAL,
                List.of(FeatureGate.OFFSITE_PROCESSING, FeatureGate.CLIENT_SIDE),
                500L,
                500L,
                LocalDateTime.of(2026, 6, 1, 0, 0),
                LocalDateTime.of(2026, 7, 1, 0, 0));
    }

    private static User userWithTeam(long userId, long teamId) {
        User u = new User();
        u.setId(userId);
        Team t = new Team();
        t.setId(teamId);
        u.setTeam(t);
        return u;
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

    /** Fixture mounting four route shapes the guard's resolver needs to discriminate. */
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

        /** Endpoint without @AutoJobPostMapping — guard must skip. */
        public String plainEndpoint() {
            return "ok";
        }
    }
}
