package stirling.software.proprietary.mcp.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

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
import stirling.software.proprietary.security.service.UserService;

/**
 * Regression test for the protected-resource metadata when {@code mcp.scopes-enabled=false} (the
 * SaaS/Supabase setup, where the IdP cannot mint {@code mcp.tools.*} scopes). Advertising scopes
 * the authorization server can't issue makes spec-compliant MCP clients request them and get
 * bounced with {@code invalid_request}, so the metadata must omit them when scopes are not
 * enforced.
 */
@SpringBootTest(
        classes = McpScopeMetadataDisabledTest.TestApp.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class McpScopeMetadataDisabledTest {

    private static final String ISSUER = "https://test-issuer.example.com";
    private static final String RESOURCE_ID = "http://localhost/mcp";

    @LocalServerPort private int port;

    private final HttpClient http = HttpClient.newHttpClient();

    // McpSecurityConfig is @ConditionalOnProperty("mcp.enabled"); that condition reads the Spring
    // Environment, so it must be set here (the ApplicationProperties bean alone is not enough to
    // register the chain).
    @DynamicPropertySource
    static void mcpProperties(DynamicPropertyRegistry registry) {
        registry.add("mcp.enabled", () -> "true");
    }

    @Test
    void metadata_omitsToolScopes_whenScopesDisabled() throws Exception {
        String body = getMetadata("/.well-known/oauth-protected-resource");
        assertThat(body).contains(RESOURCE_ID);
        assertThat(body).contains(ISSUER);
        assertThat(body).doesNotContain("mcp.tools.read");
        assertThat(body).doesNotContain("mcp.tools.write");
    }

    @Test
    void pathInsertedMetadata_omitsToolScopes_whenScopesDisabled() throws Exception {
        String body = getMetadata("/.well-known/oauth-protected-resource/mcp");
        assertThat(body).contains(RESOURCE_ID);
        assertThat(body).contains("authorization_servers");
        assertThat(body).doesNotContain("mcp.tools.read");
        assertThat(body).doesNotContain("mcp.tools.write");
    }

    private String getMetadata(String path) throws Exception {
        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create("http://localhost:" + port + path))
                        .GET()
                        .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        return response.body();
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration
    @Import({McpSecurityConfig.class, McpServerController.class, DescribeOperationTool.class})
    static class TestApp {

        @Bean
        ApplicationProperties applicationProperties() {
            ApplicationProperties props = new ApplicationProperties();
            props.getMcp().setEnabled(true);
            props.getMcp().setScopesEnabled(false);
            props.getMcp().getAuth().setIssuerUri(ISSUER);
            // No real JWKS fetch happens for the permitAll metadata endpoint; a placeholder URI is
            // fine because NimbusJwtDecoder.withJwkSetUri(...) resolves the key set lazily.
            props.getMcp().getAuth().setJwksUri(ISSUER + "/jwks");
            props.getMcp().getAuth().setResourceId(RESOURCE_ID);
            props.getAutomaticallyGenerated().setAppVersion("test");
            return props;
        }

        @Bean
        UserService userService() {
            return org.mockito.Mockito.mock(UserService.class);
        }
    }
}
