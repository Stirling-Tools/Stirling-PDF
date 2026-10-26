package stirling.software.proprietary.security.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sends raw, still-encoded paths through a real server so the rules meet the same request parsing
 * and handler dispatch as production. The chain composes {@link PublicRouteRules} exactly as the
 * login-enabled chains do.
 */
@SpringBootTest(
        classes = PublicRouteRulesHttpTest.TestApp.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "spring.datasource.url=jdbc:h2:mem:public-route-rules",
            "management.endpoints.web.exposure.exclude=*"
        })
class PublicRouteRulesHttpTest {
    @LocalServerPort int port;
    private final HttpClient client = HttpClient.newHttpClient();

    private int status(String method, String rawPath) throws Exception {
        return client.send(
                        HttpRequest.newBuilder(URI.create("http://localhost:" + port + rawPath))
                                .method(method, HttpRequest.BodyPublishers.noBody())
                                .build(),
                        HttpResponse.BodyHandlers.discarding())
                .statusCode();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "/api/v1/info/load/all",
                "/%61pi/v1/info/load/all",
                "/a%70i/v1/info/load/all",
                "/ap%69/v1/info/load/all",
                "/%61pi/v1/general/files/report.png",
                "/%61ctuator/prometheus",
                "/api/v1/ai/output/x/login/oauth2/code/"
            })
    void backendHandlersNeedALoginHoweverThePathIsSpelled(String path) throws Exception {
        assertThat(status("GET", path)).isEqualTo(401);
        assertThat(status("HEAD", path)).isEqualTo(401);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "/",
                "/login",
                "/files/abc",
                "/api/v1/info/status",
                "/api/v1/auth/login",
                "/actuator/health"
            })
    void publicRoutesStayOpen(String path) throws Exception {
        assertThat(status("GET", path)).isEqualTo(200);
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration
    @Import(TestApp.Endpoints.class)
    static class TestApp {
        @Bean
        SecurityFilterChain security(HttpSecurity http) throws Exception {
            http.authorizeHttpRequests(
                            authz -> {
                                PublicRouteRules.apply(authz);
                                authz.anyRequest().authenticated();
                            })
                    .exceptionHandling(
                            e ->
                                    e.authenticationEntryPoint(
                                            new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)));
            return http.build();
        }

        @RestController
        static class Endpoints {
            @GetMapping({
                "/api/v1/info/load/all",
                "/api/v1/info/status",
                "/api/v1/auth/login",
                "/api/v1/general/files/{fileId}",
                "/api/v1/ai/output/**",
                "/actuator/prometheus",
                "/actuator/health"
            })
            String handler() {
                return "handler";
            }

            @GetMapping({"/", "/login", "/files/{id}"})
            String page() {
                return "index";
            }
        }
    }
}
