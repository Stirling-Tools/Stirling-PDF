package stirling.software.proprietary.mcp.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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

    @Test
    void acceptedAudiencesCoverBlankResourceId() {
        ApplicationProperties.Mcp mcp = newMcp();
        mcp.getAuth().setIssuerUri("https://issuer.example.com");
        mcp.getAuth().setResourceId("");
        mcp.getAuth().setAcceptedAudiences(List.of("authenticated"));
        mcp.getAuth().setUsernameClaim("email");
        mcp.setScopesEnabled(false);

        List<McpConfigValidator.Finding> findings = McpConfigValidator.validate(mcp);

        assertFalse(
                hasWarn(findings, "fails closed"),
                "accepted-audiences must satisfy audience binding without a resource id");
        assertTrue(
                findings.stream().anyMatch(f -> f.message().contains("accepted-audiences=")),
                "configured accepted-audiences should be surfaced");
    }

    @Test
    void strictAudienceHintsAtAcceptedAudiencesEscapeHatch() {
        ApplicationProperties.Mcp mcp = newMcp();
        mcp.getAuth().setIssuerUri("https://issuer.example.com");
        mcp.getAuth().setResourceId("https://host.example.com/mcp");
        mcp.getAuth().setUsernameClaim("email");
        mcp.setScopesEnabled(false);

        List<McpConfigValidator.Finding> findings = McpConfigValidator.validate(mcp);

        assertTrue(
                findings.stream().anyMatch(f -> f.message().contains("accepted-audiences")),
                "should point coarse-audience IdPs at accepted-audiences");
    }

    @Test
    void unrecognizedModeWarnsAboutOAuthFallback() {
        ApplicationProperties.Mcp mcp = newMcp();
        mcp.getAuth().setMode("api-key"); // near-miss typo that silently runs the OAuth chain

        assertTrue(hasWarn(McpConfigValidator.validate(mcp), "is not recognized"));
    }

    @Test
    void requireExistingAccountFalseWarnsAboutOpenAccess() {
        ApplicationProperties.Mcp mcp = newMcp();
        mcp.getAuth().setIssuerUri("https://issuer.example.com");
        mcp.getAuth().setResourceId("https://host.example.com/mcp");
        mcp.getAuth().setUsernameClaim("email");
        mcp.getAuth().setRequireExistingAccount(false);

        assertTrue(hasWarn(McpConfigValidator.validate(mcp), "require-existing-account=false"));
    }

    @Test
    void nonUrlResourceIdWarns() {
        ApplicationProperties.Mcp mcp = newMcp();
        mcp.getAuth().setIssuerUri("https://issuer.example.com");
        mcp.getAuth().setResourceId("localhost:8080/mcp"); // missing scheme

        assertTrue(hasWarn(McpConfigValidator.validate(mcp), "is not an http(s) URL"));
    }

    @Test
    void allowListIsFlaggedAndOverlapWithBlockListWarns() {
        ApplicationProperties.Mcp mcp = newMcp();
        mcp.getAuth().setIssuerUri("https://issuer.example.com");
        mcp.getAuth().setResourceId("https://host.example.com/mcp");
        mcp.setAllowedOperations(List.of("merge-pdfs", "split-pdf"));
        mcp.setBlockedOperations(List.of("split-pdf"));

        List<McpConfigValidator.Finding> findings = McpConfigValidator.validate(mcp);

        assertTrue(
                findings.stream().anyMatch(f -> f.message().contains("strict allow-list")),
                "an allow-list should be surfaced");
        assertTrue(hasWarn(findings, "blocked wins"), "allowed+blocked overlap should warn");
    }
}
