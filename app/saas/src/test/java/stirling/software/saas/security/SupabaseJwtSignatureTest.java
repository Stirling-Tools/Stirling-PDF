package stirling.software.saas.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.test.util.ReflectionTestUtils;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.service.ApiKeyAuthenticationService;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.service.SaasTeamService;
import stirling.software.saas.service.SupabaseUserService;

class SupabaseJwtSignatureTest {
    private HttpServer server;
    private String issuer;
    private ECKey ec;
    private RSAKey rsa;
    private JwtDecoder decoder;

    @BeforeEach
    void setup() throws Exception {
        ec = new ECKeyGenerator(Curve.P_256).keyID("preview-ec").generate();
        rsa = new RSAKeyGenerator(2048).keyID("existing-rsa").generate();
        byte[] jwks =
                new JWKSet(List.of(ec.toPublicJWK(), rsa.toPublicJWK()))
                        .toString()
                        .getBytes(StandardCharsets.UTF_8);
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/auth/v1/.well-known/jwks.json",
                exchange -> {
                    try (exchange) {
                        exchange.getResponseHeaders().set("Content-Type", "application/json");
                        exchange.sendResponseHeaders(200, jwks.length);
                        exchange.getResponseBody().write(jwks);
                    }
                });
        server.start();
        issuer = "http://127.0.0.1:" + server.getAddress().getPort() + "/auth/v1";
        SupabaseSecurityConfig config =
                new SupabaseSecurityConfig(
                        mock(UserService.class),
                        mock(TeamService.class),
                        mock(SupabaseUserService.class),
                        mock(SaasTeamService.class),
                        new ApplicationProperties(),
                        mock(ApiKeyAuthenticationService.class),
                        new MockEnvironment());
        ReflectionTestUtils.setField(config, "issuer", issuer);
        ReflectionTestUtils.setField(config, "expectedAud", "authenticated");
        ReflectionTestUtils.setField(config, "clockSkewSeconds", 0L);
        decoder = config.jwtDecoder();
    }

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ES256", "RS256"})
    void acceptsSupportedProjectKeys(String algorithm) throws Exception {
        String token = signed(algorithm, claims(issuer, "authenticated", 300));
        assertThat(decoder.decode(token).getSubject()).isEqualTo("preview-user");
    }

    @Test
    void rejectsAnotherIssuerEvenWhenSignedByKnownKey() throws Exception {
        String token =
                signed("ES256", claims("https://other.supabase.co/auth/v1", "authenticated", 300));
        assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsWrongAudience() throws Exception {
        String token = signed("ES256", claims(issuer, "other", 300));
        assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsExpiredToken() throws Exception {
        String token = signed("ES256", claims(issuer, "authenticated", -300));
        assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsSignatureFromAnotherProject() throws Exception {
        SignedJWT token =
                new SignedJWT(
                        new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(ec.getKeyID()).build(),
                        claims(issuer, "authenticated", 300));
        token.sign(new ECDSASigner(new ECKeyGenerator(Curve.P_256).generate()));
        assertThatThrownBy(() -> decoder.decode(token.serialize()))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsSymmetricTokens() throws Exception {
        SignedJWT token =
                new SignedJWT(
                        new JWSHeader(JWSAlgorithm.HS256), claims(issuer, "authenticated", 300));
        token.sign(new MACSigner(new byte[32]));
        assertThatThrownBy(() -> decoder.decode(token.serialize()))
                .isInstanceOf(JwtException.class);
    }

    private JWTClaimsSet claims(String tokenIssuer, String audience, long secondsToExpiry) {
        return new JWTClaimsSet.Builder()
                .subject("preview-user")
                .issuer(tokenIssuer)
                .audience(audience)
                .issueTime(Date.from(Instant.now().minusSeconds(600)))
                .expirationTime(Date.from(Instant.now().plusSeconds(secondsToExpiry)))
                .build();
    }

    private String signed(String algorithm, JWTClaimsSet claims) throws JOSEException {
        boolean elliptic = algorithm.equals("ES256");
        SignedJWT token =
                new SignedJWT(
                        new JWSHeader.Builder(JWSAlgorithm.parse(algorithm))
                                .keyID(elliptic ? ec.getKeyID() : rsa.getKeyID())
                                .build(),
                        claims);
        token.sign(elliptic ? new ECDSASigner(ec) : new RSASSASigner(rsa));
        return token.serialize();
    }
}
