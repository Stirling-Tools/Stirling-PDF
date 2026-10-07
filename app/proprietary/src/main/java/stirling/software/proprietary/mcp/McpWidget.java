package stirling.software.proprietary.mcp;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import stirling.software.common.model.ApplicationProperties;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** MCP Apps view (file picker and result card) that Claude and ChatGPT render in the chat. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpWidget {

    public static final String URI = "ui://stirling-pdf/app.html";
    public static final String MIME_TYPE = "text/html;profile=mcp-app";

    private final ObjectMapper mapper;
    private final ApplicationProperties applicationProperties;
    private final String html;

    public McpWidget(ObjectMapper mapper, ApplicationProperties applicationProperties) {
        this.mapper = mapper;
        this.applicationProperties = applicationProperties;
        this.html = load();
    }

    private static String load() {
        try (InputStream in = new ClassPathResource("mcp/app.html").getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("MCP widget resource mcp/app.html is missing", e);
        }
    }

    public String html() {
        return html;
    }

    /** Entry for {@code resources/list}. */
    public ObjectNode listing() {
        ObjectNode node = mapper.createObjectNode();
        node.put("uri", URI);
        node.put("name", "stirling-pdf-app");
        node.put("title", "Stirling PDF");
        node.put("description", "File picker and result card for Stirling PDF tools.");
        node.put("mimeType", MIME_TYPE);
        node.set("_meta", meta());
        return node;
    }

    /** Contents for {@code resources/read}. */
    public ObjectNode contents() {
        ObjectNode node = mapper.createObjectNode();
        node.put("uri", URI);
        node.put("mimeType", MIME_TYPE);
        node.put("text", html);
        node.set("_meta", meta());
        return node;
    }

    private ObjectNode meta() {
        ObjectNode meta = mapper.createObjectNode();
        ObjectNode ui = meta.putObject("ui");
        ui.put("prefersBorder", true);
        // No network from the view: downloads go through the host's open-link.
        ObjectNode csp = ui.putObject("csp");
        csp.putArray("connectDomains");
        csp.putArray("resourceDomains");
        meta.put(
                "openai/widgetDescription",
                "Shows a file picker or the processed file with a download button. The model"
                        + " does not need to repeat the file details.");
        meta.put("openai/widgetPrefersBorder", true);
        // ui.domain is host-specific (Claude rejects a foreign one), so only ChatGPT's alias.
        String domain = widgetDomain();
        if (domain != null) {
            meta.put("openai/widgetDomain", domain);
        }
        return meta;
    }

    /** Our own origin, which ChatGPT needs for apps with UI: the frontend, else the backend. */
    String widgetDomain() {
        ApplicationProperties.System system = applicationProperties.getSystem();
        String origin = origin(system.getFrontendUrl());
        return origin != null ? origin : origin(system.getBackendUrl());
    }

    private static String origin(String url) {
        if (url == null || url.isBlank()) {
            return null;
        }
        try {
            java.net.URI uri = java.net.URI.create(url.trim());
            if (uri.getScheme() == null || uri.getHost() == null) {
                return null;
            }
            String port = uri.getPort() == -1 ? "" : ":" + uri.getPort();
            return uri.getScheme() + "://" + uri.getHost() + port;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
