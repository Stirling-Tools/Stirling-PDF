package stirling.software.proprietary.mcp.tools;

import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.McpToolAnnotations;
import stirling.software.proprietary.mcp.files.McpFileUrlFetcher;
import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.mcp.files.McpUploadLinks;
import stirling.software.proprietary.security.model.User;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Stores a temporary file and returns its fileId. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingUploadTool implements McpTool {

    private final ObjectMapper mapper;
    private final McpFiles files;
    private final McpFileUrlFetcher fileUrlFetcher;
    private final ObjectProvider<McpUploadLinks> links;

    public StirlingUploadTool(
            ObjectMapper mapper,
            McpFiles files,
            McpFileUrlFetcher fileUrlFetcher,
            ObjectProvider<McpUploadLinks> links) {
        this.mapper = mapper;
        this.files = files;
        this.fileUrlFetcher = fileUrlFetcher;
        this.links = links;
    }

    @Override
    public String name() {
        return "stirling_upload";
    }

    @Override
    public String title() {
        return "Store a file in Stirling PDF";
    }

    @Override
    public McpToolAnnotations annotations() {
        return McpToolAnnotations.PRODUCES_FILE;
    }

    @Override
    public boolean widgetCallable() {
        return true;
    }

    @Override
    public List<String> fileParams() {
        return List.of(McpInputFiles.ATTACHMENT_ARG);
    }

    @Override
    public String analyticsCategory() {
        return "files";
    }

    @Override
    public String description() {
        return "Store a file on the Stirling PDF server and get back a fileId that any Stirling"
                + " tool accepts. Use it to keep one file across several operations, or to give an"
                + " operation a second file (a certificate, logo or stamp image, overlay PDF,"
                + " attachment) through that operation's fileId parameter, e.g."
                + " parameters.imageFile. Provide the file as a ChatGPT attachment (inputFile), as"
                + " base64 (file) if it is small, or, for a file on the user's computer, call with"
                + " link: true to get a one-time upload link: the user opens it, or you upload with"
                + " curl if you can run commands there. Then call with uploadId to get the fileId.";
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        ObjectNode props = schema.putObject("properties");
        McpToolSupport.stringProperty(
                props, "file", "Base64-encoded file content, for small files only (about 100 KB).");
        props.putObject("link")
                .put("type", "boolean")
                .put(
                        "description",
                        "true: return a one-time upload link (15 minutes) instead of taking a file.");
        McpToolSupport.stringProperty(
                props, "uploadId", "The uploadId of a link made earlier, to get its fileId.");
        McpToolSupport.stringProperty(
                props, "fileName", "Optional original filename (with extension).");
        McpInputFiles.attachmentProperty(props);
        return schema;
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        if (!context.hasScope("mcp.tools.write")) {
            return McpResponses.error(
                    mapper,
                    "Insufficient scope: stirling_upload requires 'mcp.tools.write'.",
                    McpResponses.Failure.INSUFFICIENT_SCOPE);
        }
        if (McpToolSupport.textArg(arguments, "fileId") != null) {
            return McpResponses.error(mapper, "That file is already stored; reuse its fileId.");
        }
        McpUploadLinks uploadLinks = links == null ? null : links.getIfAvailable();
        String uploadId = McpToolSupport.textArg(arguments, "uploadId");
        if (uploadLinks != null && uploadId != null) {
            return linkStatus(uploadLinks, uploadId, context);
        }
        boolean noFile =
                McpToolSupport.textArg(arguments, "file") == null
                        && (arguments == null || !arguments.has(McpInputFiles.ATTACHMENT_ARG));
        if (uploadLinks != null
                && (noFile || (arguments != null && arguments.path("link").asBoolean(false)))) {
            return newLink(uploadLinks, context);
        }
        try {
            User user = files.user(context);
            McpInputFiles.Input input =
                    McpInputFiles.resolve(arguments, files, user, fileUrlFetcher, "upload.bin");
            if (input.error() != null) {
                return McpResponses.error(mapper, input.error());
            }
            String type =
                    MediaTypeFactory.getMediaType(input.name())
                            .map(Object::toString)
                            .orElse(MediaType.APPLICATION_OCTET_STREAM_VALUE);
            McpFiles.Saved saved = files.save(user, input.bytes(), input.name(), type, false);
            return McpResponses.storedFile(mapper, "upload", saved, context.rendersApps());
        } catch (McpFiles.McpFileException e) {
            return McpResponses.error(mapper, e.getMessage());
        }
    }

    private ObjectNode newLink(McpUploadLinks uploadLinks, McpCallContext context) {
        if (context.stirlingUserId() == null) {
            return McpResponses.error(
                    mapper, "Upload links need a signed-in Stirling PDF account.");
        }
        McpUploadLinks.Link link = uploadLinks.create(context.stirlingUserId());
        ObjectNode result =
                McpResponses.text(
                        mapper,
                        "Upload link (works once, expires in "
                                + McpUploadLinks.TTL.toMinutes()
                                + " minutes): "
                                + link.url()
                                + "\nGive it to the user to open and choose the file. If you can run"
                                + " commands on the user's computer, upload it yourself instead:"
                                + " curl -sS -F \"file=@<path to the file>\" "
                                + link.url()
                                + " (it prints the fileId). Afterwards call stirling_upload with"
                                + " uploadId="
                                + link.uploadId()
                                + " to get the fileId if you do not have it yet.");
        result.putObject("structuredContent")
                .put("kind", "upload-link")
                .put("uploadUrl", link.url())
                .put("uploadId", link.uploadId())
                .put("expiresInMinutes", McpUploadLinks.TTL.toMinutes());
        return result;
    }

    private ObjectNode linkStatus(
            McpUploadLinks uploadLinks, String uploadId, McpCallContext context) {
        McpUploadLinks.Status status =
                uploadLinks.status(
                        uploadId, context.stirlingUserId() == null ? "" : context.stirlingUserId());
        if (!status.known()) {
            return McpResponses.error(
                    mapper,
                    "That upload link has expired or is not yours. Make a new one with link:"
                            + " true.");
        }
        if (status.uploaded() == null) {
            return McpResponses.text(
                    mapper,
                    "Nothing has been uploaded to that link yet. Ask the user to finish the"
                            + " upload, then call again.");
        }
        McpUploadLinks.Uploaded uploaded = status.uploaded();
        ObjectNode result =
                McpResponses.text(
                        mapper,
                        "Uploaded \""
                                + uploaded.name()
                                + "\" ("
                                + McpResponses.humanSize(uploaded.size())
                                + "), fileId="
                                + uploaded.fileId()
                                + ". Pass the fileId to another Stirling tool.");
        result.putObject("structuredContent")
                .put("kind", "file")
                .put("operation", "upload")
                .put("fileId", uploaded.fileId())
                .put("fileName", uploaded.name())
                .put("size", uploaded.size());
        return result;
    }
}
