package stirling.software.proprietary.mcp.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

class McpConfigValidatorTest {

    private static ApplicationProperties.Mcp newMcp() {
        return new ApplicationProperties.Mcp();
    }

    private static boolean hasWarn(List<McpConfigValidator.Finding> findings, String needle) {
        return findings.stream()
                .anyMatch(
                        f ->
                                f.severity() == McpConfigValidator.Severity.WARN
                                        && f.message().contains(needle));
    }

    @Test
    void apiKeyModeSkipsOAuthChecks() {
        ApplicationProperties.Mcp mcp = newMcp();
        mcp.getAuth().setMode("apikey");

        List<McpConfigValidator.Finding> findings = McpConfigValidator.validate(mcp);

        assertEquals(1, findings.size());
        assertEquals(McpConfigValidator.Severity.INFO, findings.get(0).severity());
        assertTrue(findings.get(0).message().contains("apikey"));
    }

    @Test
    void blankIssuerAndResourceProduceWarnings() {
        // Defaults: oauth mode, blank issuer-uri and resource-id.
        List<McpConfigValidator.Finding> findings = McpConfigValidator.validate(newMcp());

        assertTrue(hasWarn(findings, "issuer-uri"), "blank issuer must warn");
        assertTrue(hasWarn(findings, "resource-id"), "blank resource-id must warn");
    }

    @Test
    void subClaimWithRequireAccountWarns() {
        ApplicationProperties.Mcp mcp = newMcp();
        mcp.getAuth().setIssuerUri("https://issuer.example.com");
        mcp.getAuth().setResourceId("https://host.example.com/mcp");
        // Defaults username-claim=sub, require-existing-account=true.

        assertTrue(hasWarn(McpConfigValidator.validate(mcp), "username-claim='sub'"));
    }

    @Test
    void completeConfigReportsReadyWithNoWarnings() {
        ApplicationProperties.Mcp mcp = newMcp();
        mcp.getAuth().setIssuerUri("https://issuer.example.com");
        mcp.getAuth().setResourceId("https://host.example.com/mcp");
        mcp.getAuth().setUsernameClaim("email");
        mcp.setScopesEnabled(false);

        List<McpConfigValidator.Finding> findings = McpConfigValidator.validate(mcp);

        assertTrue(
                findings.stream().noneMatch(f -> f.severity() == McpConfigValidator.Severity.WARN),
                "complete config must have no warnings");
        assertTrue(findings.stream().anyMatch(f -> f.message().contains("look complete")));
    }
}
