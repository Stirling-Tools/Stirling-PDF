package stirling.software.proprietary.mcp.tools;

import java.net.URI;
import java.util.List;
import java.util.Locale;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.McpToolAnnotations;
import stirling.software.proprietary.mcp.files.McpFileUrlFetcher;
import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.mcp.files.McpFiles.Listed;
import stirling.software.proprietary.security.model.User;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Lets the user pick a file: ChatGPT's native picker form when offered, else the in-chat widget,
 * which uploads to stirling_upload so the bytes skip the model.
 */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingSelectFileTool implements McpTool {

    static final String INPUT_KEY = "stirling_file";
    static final String OPENAI_FORM = "openai/elicitation/create";
    static final int RECENT = 20;
    // Kept in step with the picker's accept list in mcp/app.html.
    static final List<String> ACCEPT =
            List.of(
                    ".pdf", "image/*", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt",
                    ".ods", ".odp", ".rtf", ".txt", ".html", ".md", ".csv", ".epub", ".mobi",
                    ".azw3", ".fb2", ".eml", ".msg", ".zip", ".cbz", ".cbr", ".ps", ".eps", ".svg",
                    ".p12", ".pfx", ".pem", ".crt", ".cer", ".der", ".key", ".jks");

    private final ObjectMapper mapper;
    private final McpFiles files;
    private final McpFileUrlFetcher fetcher;

    public StirlingSelectFileTool(ObjectMapper mapper, McpFiles files, McpFileUrlFetcher fetcher) {
        this.mapper = mapper;
        this.files = files;
        this.fetcher = fetcher;
    }

    @Override
    public String name() {
        return "stirling_select_file";
    }

    @Override
    public String title() {
        return "Upload a file";
    }

    @Override
    public McpToolAnnotations annotations() {
        return McpToolAnnotations.READ_ONLY;
    }

    @Override
    public boolean rendersWidget() {
        return true;
    }

    @Override
    public boolean requiresWidget() {
        return true;
    }

    @Override
    public boolean threadEntrypoint() {
        return true;
    }

    @Override
    public String description() {
        return "Let the user choose a file (a PDF, image, office document, email, e-book,"
                + " archive or signing certificate) from their device or their Stirling files,"
                + " without the bytes passing through the model. Use this when the"
                + " user wants a file processed but it has no Stirling fileId yet and no"
                + " attachment is available. Always pass 'purpose'. Returns the chosen fileId, or"
                + " shows a picker whose choice comes back as the user's next message.";
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        ObjectNode props = schema.putObject("properties");
        McpToolSupport.stringProperty(
                props,
                "purpose",
                "Short description of what will be done with the file, shown to the user"
                        + " (e.g. 'Compress to under 5 MB').");
        return schema;
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        if (!context.hasScope("mcp.tools.write")) {
            return McpResponses.error(
                    mapper,
                    "Insufficient scope: uploading a file requires 'mcp.tools.write'. Reconnect"
                            + " Stirling PDF with write access.",
                    McpResponses.Failure.INSUFFICIENT_SCOPE);
        }
        String purpose = McpToolSupport.textArg(arguments, "purpose");
        User user = files.user(context);
        JsonNode answer = context.inputResponse(INPUT_KEY);
        if (answer != null) {
            if (!"accept".equals(answer.path("action").asText())) {
                return McpResponses.text(mapper, "The user closed the picker without a file.");
            }
            return chosen(user, answer.path("content").path("file").asText(""), purpose);
        }
        // Entrypoint tabs open with {}; keep those on the widget, which the host renders there.
        boolean fromModel = arguments != null && !arguments.isEmpty();
        if (fromModel && context.canElicitOpenAiForm()) {
            return McpResponses.inputRequired(mapper, INPUT_KEY, OPENAI_FORM, form(user, purpose));
        }
        return picker(user, purpose, null);
    }

    private ObjectNode form(User user, String purpose) {
        ObjectNode params = mapper.createObjectNode();
        params.put("mode", "form");
        params.put("message", purpose != null ? purpose : "Choose a file for Stirling PDF");
        ObjectNode schema = params.putObject("requestedSchema");
        schema.put("type", "object");
        ObjectNode field = schema.putObject("properties").putObject("file");
        field.put("type", "string");
        field.put("title", "File");
        field.put("format", "uri");
        ObjectNode input = field.putObject("x-openai-input");
        input.put("type", "resource");
        ArrayNode options = input.putArray("options");
        for (Listed f : files.recent(user, null, RECENT)) {
            ObjectNode option = options.addObject();
            option.put("uri", f.uri());
            option.put("name", f.name());
            if (f.contentType() != null) {
                option.put("mimeType", f.contentType());
            }
            option.put("size", f.size());
        }
        ArrayNode accept = input.putObject("userOptions").put("kind", "file").putArray("accept");
        ACCEPT.forEach(accept::add);
        schema.putArray("required").add("file");
        return params;
    }

    private ObjectNode chosen(User user, String uri, String purpose) {
        if (uri.startsWith(McpFiles.FILE_URI_PREFIX)) {
            Listed f = files.describe(user, uri);
            return f == null
                    ? picker(user, purpose, "That file is no longer available.")
                    : selected(f.fileId(), f.name(), f.size());
        }
        if (uri.startsWith("https://")) {
            try {
                String name = nameOf(uri);
                McpFiles.Saved saved =
                        files.save(user, fetcher.fetch(uri), name, contentTypeOf(name), false);
                return selected(saved.fileId(), saved.name(), saved.size());
            } catch (McpFileUrlFetcher.FetchException | McpFiles.McpFileException e) {
                return picker(user, purpose, e.getMessage());
            }
        }
        return picker(user, purpose, "Stirling PDF could not read the chosen file.");
    }

    private ObjectNode selected(String fileId, String name, long size) {
        ObjectNode result =
                McpResponses.text(
                        mapper,
                        "The user chose \""
                                + name
                                + "\" ("
                                + McpResponses.humanSize(size)
                                + "), fileId="
                                + fileId
                                + ". Pass the fileId to another Stirling tool.");
        ObjectNode structured = result.putObject("structuredContent");
        structured.put("kind", "file");
        structured.put("operation", "selected");
        structured.put("fileId", fileId);
        structured.put("fileName", name);
        structured.put("size", size);
        return result;
    }

    /** The in-chat picker, listing recent files; {@code problem} explains a failed choice. */
    private ObjectNode picker(User user, String purpose, String problem) {
        ObjectNode result =
                McpResponses.fileList(mapper, "picker", files.recent(user, null, RECENT));
        String text =
                "A file picker is shown to the user. Wait for their next message, which will"
                        + " include the fileId of the file they chose.";
        result.set(
                "content",
                McpResponses.text(mapper, problem == null ? text : problem + " " + text)
                        .get("content"));
        ObjectNode structured = (ObjectNode) result.get("structuredContent");
        if (purpose != null) {
            structured.put("purpose", purpose);
        }
        if (problem != null) {
            structured.put("problem", problem);
        }
        return result;
    }

    private static String nameOf(String url) {
        String path;
        try {
            path = URI.create(url).getPath();
        } catch (IllegalArgumentException e) {
            path = null;
        }
        String last = path == null ? "" : path.substring(path.lastIndexOf('/') + 1);
        return last.contains(".") ? last : "upload.pdf";
    }

    private static String contentTypeOf(String name) {
        return name.toLowerCase(Locale.ROOT).endsWith(".pdf")
                ? "application/pdf"
                : "application/octet-stream";
    }
}
