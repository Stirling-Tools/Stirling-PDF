package stirling.software.proprietary.mcp.tools;

import java.util.ArrayList;
import java.util.List;

import stirling.software.proprietary.mcp.files.McpFileUrlFetcher;
import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.security.model.User;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Resolves a tool's input from {@code fileId}, then {@code inputFile}, then base64. */
final class McpInputFiles {

    /** ChatGPT sends each {@code openai/fileParams} field as {download_url, file_id, ...}. */
    static final String ATTACHMENT_ARG = "inputFile";

    private McpInputFiles() {}

    record Input(byte[] bytes, String name, String error) {
        static Input fail(String error) {
            return new Input(null, null, error);
        }
    }

    /** True when the call names a single input (fileId, attachment or base64). */
    static boolean hasSingle(JsonNode args) {
        return McpToolSupport.textArg(args, "fileId") != null
                || McpToolSupport.textArg(args, "file") != null
                || (args != null && args.has(ATTACHMENT_ARG));
    }

    /** Files from the {@code fileIds} list, in order; the first failure stops the list. */
    static List<Input> resolveList(JsonNode args, McpFiles files, User user) {
        List<Input> inputs = new ArrayList<>();
        JsonNode ids = args == null ? null : args.get("fileIds");
        if (ids == null || !ids.isArray()) {
            return inputs;
        }
        for (JsonNode id : ids) {
            try {
                McpFiles.Loaded loaded = files.load(user, id.asText());
                inputs.add(new Input(loaded.bytes(), loaded.name(), null));
            } catch (McpFiles.McpFileException e) {
                return List.of(Input.fail(e.getMessage()));
            }
        }
        return inputs;
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
                return Input.fail(
                        e.getMessage()
                                + " Ask the user to choose the file with stirling_select_file, or"
                                + " pass it as base64 in 'file'.");
            }
        }
        String base64 = McpToolSupport.textArg(args, "file");
        if (base64 == null) {
            return Input.fail(
                    "This needs an input file. Pass 'fileId' from an earlier result or upload, or"
                            + " 'file' as base64 for a small file. For a file on the user's"
                            + " computer, get an upload link from stirling_upload with link: true.");
        }
        byte[] bytes = McpToolSupport.decodeBase64OrNull(base64);
        if (bytes == null) {
            return Input.fail("The 'file' argument is not valid base64.");
        }
        return new Input(bytes, fileName != null ? fileName : fallbackName, null);
    }

    /** The {@code steps} array: each item an operation id plus its parameters. */
    static void stepsProperty(ObjectNode props, int maxSteps, String description) {
        ObjectNode steps = props.putObject("steps");
        steps.put("type", "array");
        steps.put("maxItems", maxSteps);
        steps.put("description", description);
        ObjectNode item = steps.putObject("items");
        item.put("type", "object");
        ObjectNode itemProps = item.putObject("properties");
        McpToolSupport.stringProperty(
                itemProps,
                "operation",
                "Operation id from a Stirling category tool, e.g. 'compress-pdf'.");
        ObjectNode parameters = itemProps.putObject("parameters");
        parameters.put("type", "object");
        parameters.put("description", "That operation's parameters.");
        parameters.put("additionalProperties", true);
        item.putArray("required").add("operation");
    }

    /** Every way a tool can receive its input: base64, fileId(s) or a chat attachment. */
    static void inputProperties(ObjectNode props) {
        McpToolSupport.stringProperty(
                props,
                "file",
                "Base64 file content, small files only (about 100 KB); otherwise use an upload"
                        + " link (stirling_upload, link: true).");
        McpToolSupport.stringProperty(
                props,
                "fileName",
                "Original filename with extension. Needed when the input is not a PDF: the"
                        + " extension picks the converter (e.g. page.html, notes.md, report.docx).");
        McpToolSupport.stringProperty(
                props,
                "fileId",
                "Id of a file already on the server: an earlier result, or one the user uploaded."
                        + " Preferred for multi-step workflows.");
        attachmentProperty(props);
        ObjectNode fileIds = props.putObject("fileIds");
        fileIds.put("type", "array");
        fileIds.putObject("items").put("type", "string");
        fileIds.put(
                "description",
                "Several stored documents, in order, for operations that take more than one"
                        + " (such as merge-pdfs). Upload each first with stirling_upload if needed. A"
                        + " supporting file (certificate, image, overlay) goes in its own fileId"
                        + " parameter instead.");
    }

    /** Schema for the {@code inputFile} attachment object a chat app fills in. */
    static void attachmentProperty(ObjectNode properties) {
        ObjectNode prop = properties.putObject(ATTACHMENT_ARG);
        prop.put("type", "object");
        prop.put(
                "description",
                "ChatGPT attachments only. Other apps: stirling_select_file or an upload link.");
        ObjectNode props = prop.putObject("properties");
        McpToolSupport.stringProperty(props, "download_url", "Temporary download URL.");
        McpToolSupport.stringProperty(props, "file_id", "Chat app file id.");
        McpToolSupport.stringProperty(props, "file_name", "Original file name.");
        McpToolSupport.stringProperty(props, "mime_type", "File MIME type.");
        // ChatGPT app review rejects fileParams schemas that don't require both.
        prop.putArray("required").add("download_url").add("file_id");
    }
}
