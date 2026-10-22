package stirling.software.proprietary.security.filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.LicenseServiceInterface;
import stirling.software.proprietary.security.configuration.ee.DatabaseLicenseGuard;

/** Exercises servlet registration order against a security chain that terminates SAML requests. */
@SpringBootTest(
        classes = LicenseFilterHttpTest.TestApp.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.datasource.url=jdbc:h2:mem:license-filter")
class LicenseFilterHttpTest {
    @LocalServerPort int port;
    @Autowired LicenseServiceInterface license;
    @Autowired ApplicationProperties properties;
    private final HttpClient client =
            HttpClient.newBuilder().cookieHandler(new CookieManager()).build();

    @BeforeEach
    void reset() {
        when(license.isRunningProOrHigher()).thenReturn(false);
        properties.getSystem().setDatasource(new ApplicationProperties.Datasource());
    }

    private int request(String method, String path) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (!"GET".equals(method)) {
            var tokenResponse =
                    client.send(
                            HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/csrf"))
                                    .GET()
                                    .build(),
                            HttpResponse.BodyHandlers.discarding());
            builder.header(
                    "X-CSRF-TOKEN",
                    tokenResponse.headers().firstValue("X-CSRF-TOKEN").orElseThrow());
        }
        return client.send(
                        builder.method(method, HttpRequest.BodyPublishers.noBody()).build(),
                        HttpResponse.BodyHandlers.discarding())
                .statusCode();
    }

    @Test
    void samlHandshakeCanIdentifyGrandfatheredUsersWithoutAPaidPlan() throws Exception {
        for (String path :
                new String[] {
                    "/saml2/authenticate/company",
                    "/saml2/metadata/company",
                    "/login/saml2/sso/company"
                }) {
            assertThat(request("GET", path)).isEqualTo(302);
            when(license.isRunningProOrHigher()).thenReturn(true);
            assertThat(request("GET", path)).isEqualTo(302);
            when(license.isRunningProOrHigher()).thenReturn(false);
        }
    }

    @Test
    void externalDatabaseAllowsRecoveryThenUnlocksAfterTeamActivation() throws Exception {
        properties.getSystem().getDatasource().setEnableCustomDatabase(true);
        assertThat(request("POST", "/api/v1/misc/compress-pdf")).isEqualTo(402);
        assertThat(request("POST", "/api/v1/account-link/connect/start")).isEqualTo(204);
        assertThat(request("POST", "/api/v1/user/change-password-on-login")).isEqualTo(204);
        assertThat(request("POST", "/api/v1/admin/license/resync")).isEqualTo(204);
        assertThat(request("GET", "/api/v1/files/existing")).isEqualTo(204);
        when(license.isRunningProOrHigher()).thenReturn(true);
        assertThat(request("POST", "/api/v1/misc/compress-pdf")).isEqualTo(204);
        when(license.isRunningProOrHigher()).thenReturn(false);
        assertThat(request("POST", "/api/v1/misc/compress-pdf")).isEqualTo(402);
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration
    @Import({
        EnterpriseEndpointFilter.class,
        DatabaseLicenseFilter.class,
        DatabaseLicenseGuard.class
    })
    static class TestApp {
        @Bean
        ApplicationProperties properties() {
            return new ApplicationProperties();
        }

        @Bean
        LicenseServiceInterface license() {
            return mock(LicenseServiceInterface.class);
        }

        @Bean
        SecurityFilterChain security(HttpSecurity http) throws Exception {
            http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
            http.addFilterBefore(
                    new OncePerRequestFilter() {
                        @Override
                        protected void doFilterInternal(
                                HttpServletRequest request,
                                HttpServletResponse response,
                                FilterChain chain) {
                            CsrfToken token =
                                    (CsrfToken) request.getAttribute(CsrfToken.class.getName());
                            response.setHeader("X-CSRF-TOKEN", token.getToken());
                            response.setStatus(
                                    request.getRequestURI().contains("saml2") ? 302 : 204);
                        }
                    },
                    UsernamePasswordAuthenticationFilter.class);
            return http.build();
        }
    }
}
