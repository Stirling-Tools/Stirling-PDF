package stirling.software.saas.sso;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import jakarta.servlet.Filter;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.security.McpSecurityConfig;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.security.EnhancedJwtAuthenticationToken;

import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;

class SaasMcpSecurityTest {
    private static final String ISSUER = "https://supabase.example.test/auth/v1";
    private final UUID originalAuth = UUID.randomUUID();
    private final UUID companyAuth = UUID.randomUUID();
    private final UUID session = UUID.randomUUID();
    private final UUID provider = UUID.randomUUID();
    private final CompanySsoStore store = mock(CompanySsoStore.class);
    private final UserRepository users = mock(UserRepository.class);
    private final UserService userService = mock(UserService.class);
    private final TeamMembershipRepository memberships = mock(TeamMembershipRepository.class);
    private final ApplicationProperties properties = new ApplicationProperties();
    private final User user = new User();
    private final TeamMembership membership = new TeamMembership();
    private final ProbeController probe = new ProbeController();
    private MockWebServer jwks;
    private KeyPair keys;
    private WebApplicationContextRunner runner;

    @BeforeEach
    void setup() throws Exception {
        var generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        keys = generator.generateKeyPair();
        String publicKeys =
                new JWKSet(
                                new RSAKey.Builder((RSAPublicKey) keys.getPublic())
                                        .keyID("test")
                                        .build())
                        .toString();
        jwks = new MockWebServer();
        jwks.setDispatcher(
                new Dispatcher() {
                    @Override
                    public MockResponse dispatch(RecordedRequest request) {
                        return new MockResponse()
                                .setHeader("Content-Type", "application/json")
                                .setBody(publicKeys);
                    }
                });
        jwks.start();
        var auth = properties.getMcp().getAuth();
        properties.getMcp().setEnabled(true);
        auth.setIssuerUri(ISSUER);
        auth.setJwksUri(jwks.url("/jwks").toString());
        auth.setAcceptedAudiences(List.of("authenticated"));
        auth.setUsernameClaim("email");
        auth.setRequireExistingAccount(false);
        var trusted = NimbusJwtDecoder.withPublicKey((RSAPublicKey) keys.getPublic()).build();
        trusted.setJwtValidator(JwtValidators.createDefaultWithIssuer(ISSUER));
        runner =
                new WebApplicationContextRunner()
                        .withPropertyValues("spring.profiles.active=saas", "mcp.enabled=true")
                        .withInitializer(
                                context ->
                                        context.getBeanFactory()
                                                .registerSingleton(
                                                        "applicationProperties", properties))
                        .withUserConfiguration(
                                WebSecurity.class,
                                McpSecurityConfig.class,
                                SaasMcpAuthenticationPolicy.class,
                                CompanySsoPolicy.class)
                        .withBean(UserService.class, () -> userService)
                        .withBean(UserRepository.class, () -> users)
                        .withBean(CompanySsoStore.class, () -> store)
                        .withBean(TeamMembershipRepository.class, () -> memberships)
                        .withBean("jwtDecoder", JwtDecoder.class, () -> trusted);
        Team team = new Team();
        team.setId(7L);
        user.setId(4L);
        user.setUsername("owner@example.com");
        user.setSupabaseId(originalAuth);
        user.setTeam(team);
        membership.setMembershipId(10L);
        membership.setTeam(team);
        membership.setUser(user);
        var binding = new CompanySsoStore.Binding(companyAuth, 4, 7);
        when(users.findById(4L)).thenReturn(Optional.of(user));
        when(users.findBySupabaseId(originalAuth)).thenReturn(Optional.of(user));
        when(store.binding(companyAuth)).thenReturn(Optional.of(binding));
        when(store.userBinding(4)).thenReturn(Optional.of(binding));
        when(store.team(7))
                .thenReturn(
                        Optional.of(
                                new CompanySsoStore.Connection(
                                        UUID.randomUUID(), 7, provider, true, 1, 4L)));
        when(store.admitted(session, 4, 10)).thenReturn(true);
        when(memberships.findByTeamIdAndUserId(7L, 4L)).thenReturn(Optional.of(membership));
        when(memberships.findByUserId(4L)).thenReturn(List.of(membership));
        when(userService.getUserByApiKey("personal-key")).thenReturn(Optional.of(user));
    }

    @AfterEach
    void cleanup() throws Exception {
        SecurityContextHolder.clearContext();
        jwks.shutdown();
    }

    @ParameterizedTest
    @ValueSource(strings = {"X-API-KEY", "Authorization"})
    void managedPersonalKeysCannotReachMcp(String header) {
        properties.getMcp().getAuth().setMode("apikey");
        runner.run(
                context -> {
                    assertThat(context).hasNotFailed();
                    mvc(context.getBean("springSecurityFilterChain", Filter.class))
                            .perform(
                                    post("/mcp")
                                            .header(
                                                    header,
                                                    header.equals("Authorization")
                                                            ? "Bearer personal-key"
                                                            : "personal-key"))
                            .andExpect(status().isForbidden());
                    assertThat(probe.authentication).isNull();
                });
    }

    @Test
    void unmanagedPersonalKeysRemainUsable() {
        properties.getMcp().getAuth().setMode("apikey");
        when(store.userBinding(4)).thenReturn(Optional.empty());
        when(store.team(7)).thenReturn(Optional.empty());
        runner.run(
                context ->
                        mvc(context.getBean("springSecurityFilterChain", Filter.class))
                                .perform(post("/mcp").header("X-API-KEY", "personal-key"))
                                .andExpect(status().isOk())
                                .andExpect(content().string(user.getUsername())));
    }

    @Test
    void companyMemberWhoHasNotConnectedSsoCannotUseAPersonalKey() {
        properties.getMcp().getAuth().setMode("apikey");
        when(store.userBinding(4)).thenReturn(Optional.empty());
        runner.run(
                context ->
                        mvc(context.getBean("springSecurityFilterChain", Filter.class))
                                .perform(post("/mcp").header("X-API-KEY", "personal-key"))
                                .andExpect(status().isForbidden()));
        assertThat(probe.authentication).isNull();
    }

    @Test
    void admittedCompanySessionUsesOriginalUserAndRetainsBearerForToolCalls() throws Exception {
        String token = token(companyAuth, claims -> {});
        runner.run(
                context -> {
                    assertThat(context).hasNotFailed();
                    mvc(context.getBean("springSecurityFilterChain", Filter.class))
                            .perform(post("/mcp").header("Authorization", "Bearer " + token))
                            .andExpect(status().isOk())
                            .andExpect(content().string(user.getUsername()));
                    assertThat(probe.authentication)
                            .isInstanceOf(EnhancedJwtAuthenticationToken.class);
                    var bound = (EnhancedJwtAuthenticationToken) probe.authentication;
                    assertThat(bound.getPrincipal()).isSameAs(user);
                    assertThat(bound.getSupabaseId()).isEqualTo(originalAuth.toString());
                    assertThat(bound.getToken().getTokenValue()).isEqualTo(token);
                    assertThat(bound.getAuthorities())
                            .extracting("authority")
                            .contains("SCOPE_mcp.tools.read");
                });
    }

    @Test
    void removalAndRejoinCannotReviveOldMcpSessions() throws Exception {
        String token = token(companyAuth, claims -> {});
        runner.run(
                context -> {
                    var mvc = mvc(context.getBean("springSecurityFilterChain", Filter.class));
                    var request = post("/mcp").header("Authorization", "Bearer " + token);
                    mvc.perform(request).andExpect(status().isOk());
                    when(memberships.findByTeamIdAndUserId(7L, 4L)).thenReturn(Optional.empty());
                    mvc.perform(request).andExpect(status().isForbidden());
                    membership.setMembershipId(11L);
                    when(memberships.findByTeamIdAndUserId(7L, 4L))
                            .thenReturn(Optional.of(membership));
                    mvc.perform(request).andExpect(status().isForbidden());
                });
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "ordinary",
                "wrong-provider",
                "unadmitted",
                "disabled",
                "anonymous",
                "service-role",
                "missing-session",
                "invalid-subject",
                "other-issuer",
                "unbound"
            })
    void invalidCompanyAccessCannotReachMcpEvenWithAccountBindingDisabled(String scenario)
            throws Exception {
        if (scenario.equals("unadmitted")) when(store.admitted(session, 4, 10)).thenReturn(false);
        if (scenario.equals("disabled")) user.setEnabled(false);
        if (scenario.equals("unbound"))
            when(store.binding(companyAuth)).thenReturn(Optional.empty());
        if (scenario.equals("other-issuer"))
            properties.getMcp().getAuth().setIssuerUri("https://other.example.test");
        String token =
                token(
                        scenario.equals("ordinary") ? originalAuth : companyAuth,
                        claims -> {
                            switch (scenario) {
                                case "ordinary" ->
                                        claims.claim("amr", List.of(Map.of("method", "password")));
                                case "wrong-provider" ->
                                        claims.claim("amr", saml(UUID.randomUUID()));
                                case "anonymous" -> claims.claim("is_anonymous", true);
                                case "service-role" -> claims.claim("role", "service_role");
                                case "missing-session" -> claims.claim("session_id", null);
                                case "invalid-subject" -> claims.subject("owner@example.com");
                                case "other-issuer" -> claims.issuer("https://other.example.test");
                                default -> {}
                            }
                        });
        runner.run(
                context -> {
                    mvc(context.getBean("springSecurityFilterChain", Filter.class))
                            .perform(post("/mcp").header("Authorization", "Bearer " + token))
                            .andExpect(status().isForbidden());
                    assertThat(probe.authentication).isNull();
                });
    }

    @Test
    void ordinarySessionForUnmanagedProvisionedUserRemainsUsable() throws Exception {
        when(store.userBinding(4)).thenReturn(Optional.empty());
        when(store.team(7)).thenReturn(Optional.empty());
        String token =
                token(
                        originalAuth,
                        claims -> claims.claim("amr", List.of(Map.of("method", "password"))));
        runner.run(
                context ->
                        mvc(context.getBean("springSecurityFilterChain", Filter.class))
                                .perform(post("/mcp").header("Authorization", "Bearer " + token))
                                .andExpect(status().isOk())
                                .andExpect(content().string(user.getUsername())));
    }

    private MockMvc mvc(Filter security) {
        return MockMvcBuilders.standaloneSetup(probe).addFilters(security).build();
    }

    private String token(UUID subject, Consumer<JWTClaimsSet.Builder> customize) throws Exception {
        var claims =
                new JWTClaimsSet.Builder()
                        .issuer(ISSUER)
                        .subject(subject.toString())
                        .audience("authenticated")
                        .issueTime(Date.from(Instant.now()))
                        .expirationTime(Date.from(Instant.now().plusSeconds(300)))
                        .claim("role", "authenticated")
                        .claim("session_id", session.toString())
                        .claim("email", "untrusted-username@example.com")
                        .claim("scope", "mcp.tools.read")
                        .claim("amr", saml(provider));
        customize.accept(claims);
        var jwt =
                new SignedJWT(
                        new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("test").build(),
                        claims.build());
        jwt.sign(new RSASSASigner((RSAPrivateKey) keys.getPrivate()));
        return jwt.serialize();
    }

    private List<Map<String, Object>> saml(UUID providerId) {
        return List.of(
                Map.of(
                        "method",
                        "sso/saml",
                        "provider",
                        providerId.toString(),
                        "timestamp",
                        Instant.now().getEpochSecond()));
    }

    @Configuration
    @EnableWebSecurity
    @EnableWebMvc
    static class WebSecurity {}

    @RestController
    static class ProbeController {
        Authentication authentication;

        @PostMapping("/mcp")
        String call() {
            authentication = SecurityContextHolder.getContext().getAuthentication();
            return authentication.getName();
        }
    }
}
