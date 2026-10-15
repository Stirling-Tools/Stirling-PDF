package stirling.software.proprietary.mcp;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import stirling.software.common.model.ApplicationProperties;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** MCP Apps view (file picker and result card) that Claude and ChatGPT render in the chat. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpWidget {

    public static final String URI = "ui://stirling-pdf/app.html";
    // Same view, but allowed fullscreen: ChatGPT opens thread entrypoints fullscreen, and a
    // fullscreen-capable result template made it open every result in its side panel.
    public static final String PICKER_URI = "ui://stirling-pdf/picker.html";
    public static final String MIME_TYPE = "text/html;profile=mcp-app";

    // Stirling mark: monochrome for ChatGPT's sidebar, brand colours for the server icon.
    private static final String MONO_ICON =
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 20 20\">"
                    + "<path d=\"M7.9 10.5 16.9 3v7l-9 7.4z\" fill=\"currentColor\""
                    + " fill-opacity=\".6\"/>"
                    + "<path d=\"M3.1 10 12.1 2.6v6.9l-9 7.4z\" fill=\"currentColor\"/></svg>";
    private static final String BRAND_ICON =
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\">"
                    + "<rect width=\"512\" height=\"512\" rx=\"80\" fill=\"#8E3131\"/>"
                    + "<path d=\"M202 268 432 78v177L202 445z\" fill=\"#fff\" fill-opacity=\".6\"/>"
                    + "<path d=\"M79 256 309 66v176L79 432z\" fill=\"#fff\"/></svg>";

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

    /** MCP {@code icons} array for a thread entrypoint tool. */
    public ArrayNode entrypointIcons() {
        return icons(MONO_ICON);
    }

    /** MCP {@code icons} array for {@code serverInfo}. */
    public ArrayNode serverIcons() {
        return icons(BRAND_ICON);
    }

    private ArrayNode icons(String svg) {
        ArrayNode icons = mapper.createArrayNode();
        ObjectNode icon = icons.addObject();
        icon.put(
                "src",
                "data:image/svg+xml;base64,"
                        + Base64.getEncoder().encodeToString(svg.getBytes(StandardCharsets.UTF_8)));
        icon.put("mimeType", "image/svg+xml");
        icon.putArray("sizes").add("any");
        return icons;
    }

    /** True for the URIs this widget serves. */
    public boolean serves(String uri) {
        return URI.equals(uri) || PICKER_URI.equals(uri);
    }

    /** Entries for {@code resources/list}. */
    public List<ObjectNode> listings() {
        return List.of(
                listing(URI, "stirling-pdf-app"), listing(PICKER_URI, "stirling-pdf-picker"));
    }

    private ObjectNode listing(String uri, String name) {
        ObjectNode node = mapper.createObjectNode();
        node.put("uri", uri);
        node.put("name", name);
        node.put("title", "Stirling PDF");
        node.put("description", "File picker and result card for Stirling PDF tools.");
        node.put("mimeType", MIME_TYPE);
        node.set("_meta", meta(uri));
        return node;
    }

    /** Contents for {@code resources/read}. */
    public ObjectNode contents(String uri) {
        ObjectNode node = mapper.createObjectNode();
        node.put("uri", uri);
        node.put("mimeType", MIME_TYPE);
        node.put("text", html);
        node.set("_meta", meta(uri));
        return node;
    }

    private ObjectNode meta(String uri) {
        ObjectNode meta = mapper.createObjectNode();
        ObjectNode ui = meta.putObject("ui");
        // The card has its own border; a host border on top insets it twice.
        ui.put("prefersBorder", false);
        // No network from the view: downloads go through the host's open-link.
        ObjectNode csp = ui.putObject("csp");
        csp.putArray("connectDomains");
        csp.putArray("resourceDomains");
        meta.put(
                "openai/widgetDescription",
                "Shows a file picker or the processed file with a download button. The model"
                        + " does not need to repeat the file details.");
        meta.put("openai/widgetPrefersBorder", false);
        ObjectNode displayModes = meta.putObject("openai/ui");
        displayModes.put("preferredDisplayMode", "inline");
        ArrayNode modes = displayModes.putArray("availableDisplayModes").add("inline");
        if (PICKER_URI.equals(uri)) {
            modes.add("fullscreen");
        }
        // Only ChatGPT's legacy CSP key can mark our download links as trusted openExternal
        // targets.
        ObjectNode openaiCsp = meta.putObject("openai/widgetCSP");
        openaiCsp.putArray("connect_domains");
        openaiCsp.putArray("resource_domains");
        ArrayNode redirects = openaiCsp.putArray("redirect_domains");
        linkOrigins().forEach(redirects::add);
        // ui.domain is host-specific (Claude rejects a foreign one), so only ChatGPT's alias.
        String domain = widgetDomain();
        if (domain != null) {
            meta.put("openai/widgetDomain", domain);
        }
        return meta;
    }

    /** Origins download links can point at: private links use the frontend, public the backend. */
    Set<String> linkOrigins() {
        ApplicationProperties.System system = applicationProperties.getSystem();
        return Stream.of(system.getFrontendUrl(), system.getBackendUrl())
                .map(McpWidget::origin)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
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
