package stirling.software.proprietary.mcp.tools;

import stirling.software.proprietary.mcp.files.McpFileUrlFetcher;
import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.security.model.User;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Resolves a tool's input file from {@code fileId}, a chat-app attachment ({@code inputFile}) or
 * inline base64 ({@code file}), in that order.
 */
final class McpInputFiles {

    /** ChatGPT sends each {@code openai/fileParams} field as {download_url, file_id, ...}. */
    static final String ATTACHMENT_ARG = "inputFile";

    private McpInputFiles() {}

    record Input(byte[] bytes, String name, String error) {
        static Input fail(String error) {
            return new Input(null, null, error);
        }
    }

    static Input resolve(
            JsonNode args,
            McpFiles files,
            User user,
            McpFileUrlFetcher fetcher,
            String fallbackName) {
        String fileName = McpToolSupport.textArg(args, "fileName");
        String fileId = McpToolSupport.textArg(args, "fileId");
        if (fileId != null) {
            try {
                McpFiles.Loaded loaded = files.load(user, fileId);
                return new Input(loaded.bytes(), fileName != null ? fileName : loaded.name(), null);
            } catch (McpFiles.McpFileException e) {
                return Input.fail(e.getMessage());
            }
        }
        JsonNode attachment = args == null ? null : args.get(ATTACHMENT_ARG);
        if (attachment != null && attachment.isObject()) {
            String url = McpToolSupport.textArg(attachment, "download_url");
            if (url == null) {
                return Input.fail("The attached file has no download_url.");
            }
            if (fetcher == null) {
                return Input.fail("File attachments are not enabled on this server.");
            }
            try {
                String attachedName = McpToolSupport.textArg(attachment, "file_name");
                String name = fileName != null ? fileName : attachedName;
                return new Input(fetcher.fetch(url), name != null ? name : fallbackName, null);
            } catch (McpFileUrlFetcher.FetchException e) {
                return Input.fail(e.getMessage());
            }
        }
        String base64 = McpToolSupport.textArg(args, "file");
        if (base64 == null) {
            return Input.fail(
                    "This needs an input file. Attach one, pass 'fileId' from an earlier result or"
                            + " upload, or pass 'file' as base64.");
        }
        byte[] bytes = McpToolSupport.decodeBase64OrNull(base64);
        if (bytes == null) {
            return Input.fail("The 'file' argument is not valid base64.");
        }
        return new Input(bytes, fileName != null ? fileName : fallbackName, null);
    }

    /** Schema for the {@code inputFile} attachment object a chat app fills in. */
    static void attachmentProperty(ObjectNode properties) {
        ObjectNode prop = properties.putObject(ATTACHMENT_ARG);
        prop.put("type", "object");
        prop.put(
                "description",
                "A file the user attached in the chat. Filled in by the chat app; leave unset"
                        + " otherwise.");
        ObjectNode props = prop.putObject("properties");
        McpToolSupport.stringProperty(props, "download_url", "Temporary download URL.");
        McpToolSupport.stringProperty(props, "file_id", "Chat app file id.");
        McpToolSupport.stringProperty(props, "file_name", "Original file name.");
        McpToolSupport.stringProperty(props, "mime_type", "File MIME type.");
        prop.putArray("required").add("download_url");
    }
}
