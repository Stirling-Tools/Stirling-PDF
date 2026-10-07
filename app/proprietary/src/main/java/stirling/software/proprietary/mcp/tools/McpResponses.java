package stirling.software.proprietary.mcp.tools;

import stirling.software.proprietary.storage.model.StoredFile;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Helpers for the MCP {@code CallToolResult} response shape. */
public final class McpResponses {

    private McpResponses() {}

    /** Plain-text content block. */
    public static ObjectNode text(ObjectMapper mapper, String text) {
        ObjectNode block = mapper.createObjectNode();
        block.put("type", "text");
        block.put("text", text);
        return wrap(mapper, block, false);
    }

    /** Plain-text error ({@code isError:true}). */
    public static ObjectNode error(ObjectMapper mapper, String message) {
        ObjectNode block = mapper.createObjectNode();
        block.put("type", "text");
        block.put("text", message);
        return wrap(mapper, block, true);
    }

    /** JSON payload as embedded text. */
    public static ObjectNode json(ObjectMapper mapper, ObjectNode payload) {
        ObjectNode block = mapper.createObjectNode();
        block.put("type", "text");
        block.put("text", payload.toString());
        return wrap(mapper, block, false);
    }

    /** A text content block (unwrapped). */
    public static ObjectNode textBlock(ObjectMapper mapper, String text) {
        ObjectNode block = mapper.createObjectNode();
        block.put("type", "text");
        block.put("text", text);
        return block;
    }

    /** An embedded-resource content block carrying base64 file content. */
    public static ObjectNode resourceBlock(
            ObjectMapper mapper, String uri, String mimeType, String base64) {
        ObjectNode block = mapper.createObjectNode();
        block.put("type", "resource");
        ObjectNode res = block.putObject("resource");
        res.put("uri", uri);
        if (mimeType != null) {
            res.put("mimeType", mimeType);
        }
        res.put("blob", base64);
        return block;
    }

    /** Result for a stored file: a short summary for the model plus the widget's file card. */
    public static ObjectNode storedFile(
            ObjectMapper mapper, String operation, StoredFile file, String downloadUrl) {
        String fileId = String.valueOf(file.getId());
        StringBuilder text =
                new StringBuilder()
                        .append(operation)
                        .append(" succeeded. Result: ")
                        .append(file.getOriginalFilename())
                        .append(" (")
                        .append(file.getSizeBytes())
                        .append(" bytes), fileId=")
                        .append(fileId)
                        .append(
                                ". Pass the fileId to another Stirling tool to keep working on it.");
        if (downloadUrl != null) {
            text.append(" Download link (expires with the file): ").append(downloadUrl);
        }
        ObjectNode result = text(mapper, text.toString());
        ObjectNode card = result.putObject("structuredContent");
        card.put("kind", "file");
        card.put("operation", operation);
        card.put("fileId", fileId);
        card.put("fileName", file.getOriginalFilename());
        if (file.getContentType() != null) {
            card.put("mimeType", file.getContentType());
        }
        card.put("size", file.getSizeBytes());
        if (downloadUrl != null) {
            card.put("downloadUrl", downloadUrl);
        }
        return result;
    }

    /** Build a result from explicit content blocks. */
    public static ObjectNode result(ObjectMapper mapper, boolean isError, ObjectNode... blocks) {
        ObjectNode result = mapper.createObjectNode();
        ArrayNode content = result.putArray("content");
        for (ObjectNode b : blocks) {
            content.add(b);
        }
        if (isError) {
            result.put("isError", true);
        }
        return result;
    }

    private static ObjectNode wrap(ObjectMapper mapper, ObjectNode block, boolean isError) {
        ObjectNode result = mapper.createObjectNode();
        ArrayNode content = result.putArray("content");
        content.add(block);
        if (isError) {
            result.put("isError", true);
        }
        return result;
    }
}
