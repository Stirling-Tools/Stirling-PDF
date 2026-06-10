package stirling.software.proprietary.mcp.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.McpServerController;
import stirling.software.proprietary.mcp.tools.DescribeOperationTool;
import stirling.software.proprietary.mcp.tools.StirlingAiTool;
import stirling.software.proprietary.mcp.tools.StirlingConvertTool;
import stirling.software.proprietary.mcp.tools.StirlingMiscTool;
import stirling.software.proprietary.mcp.tools.StirlingPagesTool;
import stirling.software.proprietary.mcp.tools.StirlingSecurityTool;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/**
 * End-to-end test of {@code mcp.auth.mode=apikey} against the real security chain on live Jetty.
 */
@SpringBootTest(
        classes = McpApiKeyIntegrationTest.TestApp.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class McpApiKeyIntegrationTest {

    private static final String VALID_KEY = "stirling-test-key-abc123";

    @LocalServerPort private int port;
    private final HttpClient http = HttpClient.newHttpClient();

    @DynamicPropertySource
    static void mcpProperties(DynamicPropertyRegistry registry) {
        registry.add("mcp.enabled", () -> "true");
        registry.add("mcp.auth.mode", () -> "apikey");
    }

    @Test
    void validApiKeyViaHeader_callsToolsList() throws Exception {
        HttpResponse<String> response =
                postMcp(
                        b -> b.header("X-API-KEY", VALID_KEY),
                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("stirling_describe_operation");
    }

    @Test
    void validApiKeyViaBearer_callsToolsList() throws Exception {
        HttpResponse<String> response =
                postMcp(
                        b -> b.header("Authorization", "Bearer " + VALID_KEY),
                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");
        assertThat(response.statusCode()).isEqualTo(200);
    }

    @Test
    void noKey_isRejectedWith401() throws Exception {
        HttpResponse<String> response =
                postMcp(b -> b, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}");
        assertThat(response.statusCode()).isEqualTo(401);
    }

    @Test
    void wrongKey_isRejectedWith401() throws Exception {
        HttpResponse<String> response =
                postMcp(
                        b -> b.header("X-API-KEY", "not-a-real-key"),
                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}");
        assertThat(response.statusCode()).isEqualTo(401);
    }

    @Test
    void noOAuthMetadataInApiKeyMode() throws Exception {
        HttpRequest req =
                HttpRequest.newBuilder()
                        .uri(URI.create(base() + "/.well-known/oauth-protected-resource"))
                        .GET()
                        .build();
        HttpResponse<String> response = http.send(req, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isNotEqualTo(200);
    }

    private HttpResponse<String> postMcp(
            java.util.function.UnaryOperator<HttpRequest.Builder> headers, String body)
            throws Exception {
        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(URI.create(base() + "/mcp"))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body));
        return http.send(headers.apply(builder).build(), HttpResponse.BodyHandlers.ofString());
    }

    private String base() {
        return "http://localhost:" + port;
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration
    @Import({
        McpSecurityConfig.class,
        McpServerController.class,
        DescribeOperationTool.class,
        StirlingConvertTool.class,
        StirlingPagesTool.class,
        StirlingMiscTool.class,
        StirlingSecurityTool.class,
        StirlingAiTool.class
    })
    static class TestApp {

        @Bean
        ApplicationProperties applicationProperties() {
            ApplicationProperties props = new ApplicationProperties();
            props.getMcp().setEnabled(true);
            props.getMcp().getAuth().setMode("apikey");
            props.getAutomaticallyGenerated().setAppVersion("test");
            return props;
        }

        @Bean
        UserService userService() {
            UserService mock = org.mockito.Mockito.mock(UserService.class);
            User account = org.mockito.Mockito.mock(User.class);
            org.mockito.Mockito.when(account.isEnabled()).thenReturn(true);
            org.mockito.Mockito.when(account.getUsername()).thenReturn("alice");
            org.mockito.Mockito.when(mock.getUserByApiKey(org.mockito.ArgumentMatchers.anyString()))
                    .thenReturn(Optional.empty());
            org.mockito.Mockito.when(mock.getUserByApiKey(VALID_KEY))
                    .thenReturn(Optional.of(account));
            return mock;
        }
    }
}
