package stirling.software.proprietary.mcp.tools;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.McpToolAnnotations;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Exposes the {@code /api/v1/security/*} namespace as a single MCP tool. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingSecurityTool extends AbstractCategoryTool {

    public StirlingSecurityTool(
            ObjectMapper mapper,
            ObjectProvider<McpToolCatalog> catalog,
            ObjectProvider<McpOperationExecutor> executor) {
        super(mapper, catalog, executor);
    }

    @Override
    public String name() {
        return "stirling_security";
    }

    @Override
    public String title() {
        return "Passwords, redaction and signing";
    }

    @Override
    public String description() {
        String signing =
                serverCertificateOffered()
                        ? " digitally sign (with the user's certificate, or certType SERVER to sign"
                                + " with this server's own certificate: no file or password"
                                + " needed),"
                        : " digitally sign with a certificate,";
        return "Security and inspection: add or remove passwords and restrictions, redact,"
                + " sanitize, watermark,"
                + signing
                + " timestamp, validate or remove signatures, and inspect a PDF (info,"
                + " permissions, PDF/A and PDF/UA checks, accessibility report)."
                + " Each operation lists its parameters in the 'operation' field; call"
                + " stirling_describe_operation when an option you need is not shown.";
    }

    /** True when cert-sign offers this server's own certificate here. */
    private boolean serverCertificateOffered() {
        McpToolCatalog catalog = catalogProvider.getIfAvailable();
        if (catalog == null) {
            return false;
        }
        return catalog.findByOperationId("cert-sign")
                .map(
                        meta -> {
                            for (JsonNode type :
                                    meta.paramSchema()
                                            .path("properties")
                                            .path("certType")
                                            .path("enum")) {
                                if ("SERVER".equals(type.asText())) {
                                    return true;
                                }
                            }
                            return false;
                        })
                .orElse(false);
    }

    @Override
    protected OperationCategory category() {
        return OperationCategory.SECURITY;
    }

    @Override
    public McpToolAnnotations annotations() {
        // timestamp-pdf contacts a timestamp authority.
        return McpToolAnnotations.PRODUCES_FILE_OPEN_WORLD;
    }
}
