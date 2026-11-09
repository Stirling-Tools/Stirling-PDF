package stirling.software.saas.config;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/** SaaS MCP pins must beat the generated settings.yml, while deploy settings still win. */
class SaasMcpPinsPostProcessorTest {

    @Configuration
    static class Empty {}

    @TempDir Path dir;

    @Test
    void saasPinsBeatTheGeneratedSettingsFile() throws Exception {
        try (ConfigurableApplicationContext ctx = boot()) {
            Environment env = ctx.getEnvironment();
            assertEquals("https://abc.supabase.co/auth/v1", env.getProperty("mcp.auth.issuerUri"));
            assertEquals("authenticated", env.getProperty("mcp.auth.acceptedAudiences"));
            assertEquals("email", env.getProperty("mcp.auth.usernameClaim"));
            assertEquals("false", env.getProperty("mcp.scopesEnabled"));
        }
    }

    @Test
    void systemPropertiesStillOverrideThePins() throws Exception {
        System.setProperty("mcp.auth.usernameClaim", "preferred_username");
        try (ConfigurableApplicationContext ctx = boot()) {
            assertEquals(
                    "preferred_username",
                    ctx.getEnvironment().getProperty("mcp.auth.usernameClaim"));
        } finally {
            System.clearProperty("mcp.auth.usernameClaim");
        }
    }

    private ConfigurableApplicationContext boot() throws Exception {
        Path settings = dir.resolve("settings.yml");
        Files.writeString(
                settings,
                "mcp:\n  scopesEnabled: true\n  auth:\n    issuerUri: ''\n    usernameClaim: sub\n");
        return new SpringApplicationBuilder(Empty.class)
                .web(WebApplicationType.NONE)
                .profiles("saas")
                .properties(
                        "spring.config.additional-location=file:" + settings,
                        "SAAS_DB_PROJECT_REF=abc")
                .run();
    }
}
