package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.RequestEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.IdTokenClaimNames;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.client.RestOperations;

import stirling.software.common.model.ApplicationProperties;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

/**
 * Verifies the opt-in OAuth2/OIDC claim-dump diagnostic logging added to {@link
 * CustomOAuth2UserService} for troubleshooting provider misconfiguration (e.g. ADFS not emitting an
 * {@code email} claim).
 */
@ExtendWith(MockitoExtension.class)
class CustomOAuth2UserServiceDebugLoggingTest {

    @Mock private UserService userService;
    @Mock private LoginAttemptService loginAttemptService;
    @Mock private OidcUserRequest userRequest;

    private ListAppender<ILoggingEvent> appender;
    private Logger serviceLogger;

    @BeforeEach
    void attachLogCapture() {
        serviceLogger = (Logger) LoggerFactory.getLogger(CustomOAuth2UserService.class);
        appender = new ListAppender<>();
        appender.start();
        serviceLogger.addAppender(appender);
        // Make sure INFO-level dumps reach the appender even if the default config is WARN+.
        serviceLogger.setLevel(Level.DEBUG);
    }

    @AfterEach
    void detachLogCapture() {
        serviceLogger.detachAppender(appender);
        appender.stop();
    }

    @Test
    void whenDebugLoggingOff_failureProducesNoClaimDump() throws Exception {
        ApplicationProperties.Security.OAUTH2 props = oauthProps("email", false);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);
        // Provider gave us claims, but no "email" — same shape as the ADFS bug report.
        Map<String, Object> claims = baseClaims();
        claims.put("upn", "jdoe@demarest.com.br");
        replaceDelegateWithStub(service, claims);
        lenient()
                .when(userRequest.getIdToken())
                .thenReturn(new OidcIdToken("token", Instant.now(), Instant.MAX, claims));
        lenient().when(userRequest.getClientRegistration()).thenReturn(stubRegistration());

        assertThrows(OAuth2AuthenticationException.class, () -> service.loadUser(userRequest));

        assertThat(appender.list)
                .as("no debug dump should appear when debugLogging=false")
                .noneMatch(e -> e.getFormattedMessage().contains("[OAUTH2 DEBUG]"));
    }

    @Test
    void whenDebugLoggingOn_failureDumpsClaimsAndSuggestsAlternative() throws Exception {
        ApplicationProperties.Security.OAUTH2 props = oauthProps("email", true);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);
        Map<String, Object> claims = adfsStyleClaims();
        // ADFS-style: no `email`, but `preferred_username` IS a valid UsernameAttribute value.
        claims.put("preferred_username", "jdoe@demarest.com.br");
        // `upn` is NOT in UsernameAttribute, so it must NOT appear in the suggestion hint.
        claims.put("upn", "jdoe@demarest.com.br");
        replaceDelegateWithStub(service, claims);
        lenient()
                .when(userRequest.getIdToken())
                .thenReturn(new OidcIdToken("token", Instant.now(), Instant.MAX, claims));
        lenient().when(userRequest.getClientRegistration()).thenReturn(stubRegistration());

        assertThrows(OAuth2AuthenticationException.class, () -> service.loadUser(userRequest));

        List<ILoggingEvent> dumps =
                appender.list.stream()
                        .filter(e -> e.getFormattedMessage().contains("[OAUTH2 DEBUG]"))
                        .toList();
        assertThat(dumps).as("expected at least one debug-dump log line").isNotEmpty();

        String combined =
                String.join("\n", dumps.stream().map(ILoggingEvent::getFormattedMessage).toList());
        assertThat(combined)
                .contains("Provider registrationId : demarest")
                .contains("Configured useAsUsername: email")
                .contains("preferred_username")
                .contains("upn = jdoe@demarest.com.br")
                .contains("<NULL — this is why login fails>");
        // The hint must include 'preferred_username' (a valid UsernameAttribute value present
        // in the claims) and MUST NOT include 'upn' (not in the UsernameAttribute enum).
        String hintLine =
                combined.lines()
                        .filter(l -> l.contains("Hint:"))
                        .findFirst()
                        .orElseThrow(() -> new AssertionError("no Hint: line in dump"));
        assertThat(hintLine).contains("preferred_username").doesNotContain("upn");
    }

    @Test
    void invalidUseAsUsername_isWrappedAsOAuth2AuthenticationException() {
        // Regression: an earlier draft moved UsernameAttribute.valueOf(...) outside the try/catch,
        // so a typo'd or null useAsUsername leaked as a raw IllegalArgumentException instead of
        // being wrapped, breaking Spring's authentication exception handling. This test pins the
        // post-fix behaviour: valueOf() failures stay inside the guarded section.
        ApplicationProperties.Security.OAUTH2 props = oauthProps("not_a_real_attribute", true);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);
        lenient().when(userRequest.getClientRegistration()).thenReturn(stubRegistration());
        // No need to stub the OIDC delegate — control flow shouldn't reach it.

        OAuth2AuthenticationException thrown =
                assertThrows(
                        OAuth2AuthenticationException.class, () -> service.loadUser(userRequest));
        assertThat(thrown.getCause()).isInstanceOf(IllegalArgumentException.class);
        // We deliberately do NOT emit the claim dump in this case (we have no resolved
        // usernameAttributeKey to compare against, and the IllegalArgumentException message
        // already explains the misconfiguration).
        assertThat(appender.list)
                .as("no claim dump when useAsUsername itself is invalid")
                .noneMatch(e -> e.getFormattedMessage().contains("[OAUTH2 DEBUG]"));
    }

    @Test
    void whenUserInfoLacksPreferredUsername_entraIdLoginResolvesFromIdToken() throws Exception {
        ApplicationProperties.Security.OAUTH2 props = oauthProps("preferred_username", false);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);

        Map<String, Object> idClaims = new HashMap<>();
        idClaims.put(IdTokenClaimNames.SUB, "abc-123");
        idClaims.put(IdTokenClaimNames.ISS, "https://login.microsoftonline.com/tenant/v2.0");
        idClaims.put(IdTokenClaimNames.AUD, Collections.singletonList("client-id"));
        idClaims.put(IdTokenClaimNames.IAT, Instant.now());
        idClaims.put(IdTokenClaimNames.EXP, Instant.now().plusSeconds(3600));
        idClaims.put("preferred_username", "jane@entra.example.com");

        Map<String, Object> userInfoClaims = new HashMap<>();
        userInfoClaims.put(IdTokenClaimNames.SUB, "abc-123");
        userInfoClaims.put("name", "Jane Doe");

        ClientRegistration registration =
                ClientRegistration.withRegistrationId("entra")
                        .clientId("client-id")
                        .clientSecret("client-secret")
                        .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                        .redirectUri("https://app.example.com/login/oauth2/code/entra")
                        .authorizationUri(
                                "https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize")
                        .tokenUri("https://login.microsoftonline.com/tenant/oauth2/v2.0/token")
                        .jwkSetUri("https://login.microsoftonline.com/tenant/discovery/v2.0/keys")
                        .userInfoUri("https://graph.microsoft.com/oidc/userinfo")
                        .userNameAttributeName("sub")
                        .build();

        OAuth2AccessToken accessToken =
                new OAuth2AccessToken(
                        OAuth2AccessToken.TokenType.BEARER,
                        "access-token",
                        Instant.now(),
                        Instant.now().plusSeconds(3600));
        OidcIdToken idToken =
                new OidcIdToken("token", Instant.now(), Instant.now().plusSeconds(3600), idClaims);
        OidcUserRequest request = new OidcUserRequest(registration, accessToken, idToken);

        Field f = CustomOAuth2UserService.class.getDeclaredField("delegate");
        f.setAccessible(true);
        OidcUserService delegate = (OidcUserService) f.get(service);

        @SuppressWarnings("unchecked")
        OAuth2UserService<OAuth2UserRequest, OAuth2User> innerOauth2UserService =
                mock(OAuth2UserService.class);
        when(innerOauth2UserService.loadUser(any()))
                .thenAnswer(
                        invocation -> {
                            OAuth2UserRequest req = invocation.getArgument(0);
                            String userNameAttr =
                                    req.getClientRegistration()
                                            .getProviderDetails()
                                            .getUserInfoEndpoint()
                                            .getUserNameAttributeName();
                            return new DefaultOAuth2User(
                                    Collections.emptyList(), userInfoClaims, userNameAttr);
                        });
        delegate.setOauth2UserService(innerOauth2UserService);

        OidcUser loaded = service.loadUser(request);

        assertThat(loaded).isNotNull();
        assertThat(loaded.getName()).isEqualTo("jane@entra.example.com");
    }

    @Test
    @SuppressWarnings("unchecked")
    void whenFailureDumpReceivesEmptyUserInfoClaims_logsNotRetrievedWithoutCrashing()
            throws Exception {
        ApplicationProperties.Security.OAUTH2 props = oauthProps("email", true);

        RestOperations restOperations = mock(RestOperations.class);
        when(restOperations.exchange(
                        any(RequestEntity.class), any(ParameterizedTypeReference.class)))
                .thenReturn(ResponseEntity.ok(Collections.emptyMap()));

        DefaultOAuth2UserService fetcher = new DefaultOAuth2UserService();
        fetcher.setRestOperations(restOperations);

        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService) {
                    @Override
                    DefaultOAuth2UserService newUserInfoFetcher() {
                        return fetcher;
                    }
                };

        OidcUserService delegateMock = mock(OidcUserService.class);
        when(delegateMock.loadUser(any()))
                .thenThrow(new IllegalArgumentException("simulated load failure"));
        Field f = CustomOAuth2UserService.class.getDeclaredField("delegate");
        f.setAccessible(true);
        f.set(service, delegateMock);

        ClientRegistration registration =
                ClientRegistration.withRegistrationId("demarest")
                        .clientId("client-id")
                        .clientSecret("client-secret")
                        .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                        .redirectUri("https://app.example.com/login/oauth2/code/demarest")
                        .authorizationUri("https://sts.example.com/adfs/oauth2/authorize")
                        .tokenUri("https://sts.example.com/adfs/oauth2/token")
                        .userInfoUri("https://sts.example.com/adfs/userinfo")
                        .userNameAttributeName("sub")
                        .build();

        OAuth2AccessToken accessToken =
                new OAuth2AccessToken(
                        OAuth2AccessToken.TokenType.BEARER,
                        "token",
                        Instant.now(),
                        Instant.now().plusSeconds(3600));
        Map<String, Object> idClaims = baseClaims();
        OidcIdToken idToken =
                new OidcIdToken("token", Instant.now(), Instant.now().plusSeconds(3600), idClaims);
        OidcUserRequest request = new OidcUserRequest(registration, accessToken, idToken);

        OAuth2AuthenticationException thrown =
                assertThrows(OAuth2AuthenticationException.class, () -> service.loadUser(request));
        assertThat(thrown.getCause()).isInstanceOf(IllegalArgumentException.class);
        assertThat(thrown.getCause().getMessage()).isEqualTo("simulated load failure");

        List<ILoggingEvent> dumps =
                appender.list.stream()
                        .filter(e -> e.getFormattedMessage().contains("[OAUTH2 DEBUG]"))
                        .toList();
        assertThat(dumps).as("expected debug dump to be emitted").isNotEmpty();

        String combined =
                String.join("\n", dumps.stream().map(ILoggingEvent::getFormattedMessage).toList());
        assertThat(combined).contains("-- UserInfo endpoint: not retrieved --");
    }

    // ---------- helpers ----------

    private static ApplicationProperties.Security.OAUTH2 oauthProps(
            String useAsUsername, boolean debugLogging) {
        ApplicationProperties.Security.OAUTH2 p = new ApplicationProperties.Security.OAUTH2();
        p.setEnabled(true);
        p.setUseAsUsername(useAsUsername);
        p.setDebugLogging(debugLogging);
        return p;
    }

    private static Map<String, Object> baseClaims() {
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put(IdTokenClaimNames.SUB, "abc-123");
        claims.put(IdTokenClaimNames.ISS, "https://sts.example.com/adfs");
        claims.put(IdTokenClaimNames.AUD, Collections.singletonList("client-id"));
        claims.put(IdTokenClaimNames.IAT, Instant.now());
        claims.put(IdTokenClaimNames.EXP, Instant.now().plusSeconds(3600));
        claims.put("given_name", "Jane");
        claims.put("family_name", "Doe");
        return claims;
    }

    /**
     * ADFS-style claim set with {@code given_name}/{@code family_name} removed, so the suggestion
     * hint test isolates a single expected UsernameAttribute value.
     */
    private static Map<String, Object> adfsStyleClaims() {
        Map<String, Object> claims = baseClaims();
        claims.remove("given_name");
        claims.remove("family_name");
        return claims;
    }

    private static ClientRegistration stubRegistration() {
        return ClientRegistration.withRegistrationId("demarest")
                .clientId("client-id")
                .clientSecret("client-secret")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("https://app.example.com/login/oauth2/code/demarest")
                .authorizationUri("https://sts.example.com/adfs/oauth2/authorize")
                .tokenUri("https://sts.example.com/adfs/oauth2/token")
                .jwkSetUri("https://sts.example.com/adfs/discovery/keys")
                .build();
    }

    /**
     * Swap the private {@code delegate} field on {@link CustomOAuth2UserService} for a stub that
     * returns a {@link DefaultOidcUser} built from the supplied claims. Lets us drive the test
     * without standing up a real OIDC provider.
     */
    private void replaceDelegateWithStub(
            CustomOAuth2UserService service, Map<String, Object> claims) throws Exception {
        OidcIdToken idToken =
                new OidcIdToken("raw-token", Instant.now(), Instant.MAX, new HashMap<>(claims));
        DefaultOidcUser delegateUser =
                new DefaultOidcUser(Collections.emptyList(), idToken, IdTokenClaimNames.SUB);
        OidcUserService delegateMock = org.mockito.Mockito.mock(OidcUserService.class);
        when(delegateMock.loadUser(any())).thenReturn(delegateUser);
        Field f = CustomOAuth2UserService.class.getDeclaredField("delegate");
        f.setAccessible(true);
        f.set(service, delegateMock);
    }
}
