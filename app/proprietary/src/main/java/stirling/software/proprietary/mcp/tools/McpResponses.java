package stirling.software.proprietary.mcp.tools;

import java.util.Base64;
import java.util.List;
import java.util.Locale;

import stirling.software.proprietary.mcp.files.McpFiles.Listed;
import stirling.software.proprietary.mcp.files.McpFiles.Saved;
import stirling.software.proprietary.mcp.files.McpPreview;

import tools.jackson.databind.JsonNode;
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
    /** What kind of failure, where it happened, and whether retrying (after a fix) can help. */
    public record Failure(String code, String stage, boolean retryable) {
        public static final Failure INVALID_REQUEST =
                new Failure("invalid_request", "request", true);
        public static final Failure INSUFFICIENT_SCOPE =
                new Failure("insufficient_scope", "auth", false);
        public static final Failure RATE_LIMITED = new Failure("rate_limited", "request", true);
        public static final Failure INPUT_UNAVAILABLE =
                new Failure("input_unavailable", "input", true);
        public static final Failure INVALID_PARAMETERS =
                new Failure("invalid_parameters", "operation", true);
        public static final Failure OPERATION_FAILED =
                new Failure("operation_failed", "operation", false);
        public static final Failure OPERATION_DISABLED =
                new Failure("operation_disabled", "operation", false);
        public static final Failure TIMEOUT = new Failure("timeout", "operation", true);
        public static final Failure STORAGE_FAILED = new Failure("storage_failed", "storage", true);
        public static final Failure NOT_FOUND = new Failure("not_found", "request", false);
        public static final Failure INTERNAL = new Failure("internal_error", "operation", false);
    }

    public static ObjectNode error(ObjectMapper mapper, String message) {
        return error(mapper, message, Failure.INVALID_REQUEST);
    }

    /** An error result whose structuredContent.error lets agents branch without parsing text. */
    public static ObjectNode error(ObjectMapper mapper, String message, Failure failure) {
        ObjectNode block = mapper.createObjectNode();
        block.put("type", "text");
        block.put("text", message);
        ObjectNode result = wrap(mapper, block, true);
        ObjectNode card = result.putObject("structuredContent");
        card.put("kind", "error");
        ObjectNode error = card.putObject("error");
        error.put("code", failure.code());
        error.put("stage", failure.stage());
        error.put("retryable", failure.retryable());
        error.put("message", message);
        return result;
    }

    /** The error block of an error result, for adding httpStatus, ref and the like. */
    public static ObjectNode errorDetail(ObjectNode result) {
        return (ObjectNode) result.path("structuredContent").path("error");
    }

    /** Prefixes an error's message (e.g. with the pipeline step) and keeps its classification. */
    public static ObjectNode prefixError(ObjectNode result, String prefix) {
        JsonNode first = result.path("content").path(0);
        if (first instanceof ObjectNode block && block.has("text")) {
            block.put("text", prefix + block.get("text").asText());
        }
        if (result.path("structuredContent").path("error") instanceof ObjectNode error) {
            error.put("message", prefix + error.path("message").asText());
        }
        return result;
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

    /** A text resource the model can read directly, e.g. extracted text or CSV. */
    public static ObjectNode textResourceBlock(
            ObjectMapper mapper, String uri, String mimeType, String text) {
        ObjectNode block = mapper.createObjectNode();
        block.put("type", "resource");
        ObjectNode res = block.putObject("resource");
        res.put("uri", uri);
        if (mimeType != null) {
            res.put("mimeType", mimeType);
        }
        res.put("text", text);
        return block;
    }

    /** Result for a stored file: a short summary for the model plus the widget's file card. */
    public static ObjectNode storedFile(ObjectMapper mapper, String operation, Saved file) {
        return storedFile(mapper, operation, file, false);
    }

    /** With {@code cardShown} the text stays short, so the model doesn't repeat the card. */
    public static ObjectNode storedFile(
            ObjectMapper mapper, String operation, Saved file, boolean cardShown) {
        StringBuilder text =
                new StringBuilder()
                        .append(operation)
                        .append(" succeeded. Result: ")
                        .append(file.name())
                        .append(" (")
                        .append(humanSize(file.size()))
                        .append("), fileId=")
                        .append(file.fileId())
                        .append(
                                ". Pass the fileId to another Stirling tool to keep working on it.");
        if (cardShown && file.downloadUrl() != null) {
            text.append(
                    " The user already sees a card with Open and Download buttons, so reply in a"
                            + " sentence or two and do not repeat the link or file details.");
        } else if (file.downloadUrl() != null) {
            text.append(
                            file.privateLink()
                                    ? " Download link (the user signs in to Stirling PDF; expires"
                                            + " with the file): "
                                    : " Download link (expires with the file): ")
                    .append(file.downloadUrl());
        }
        if (file.inline() != null) {
            text.append(" The file is included inline below.");
        } else if (file.downloadUrl() == null) {
            text.append(" No download link is available; call stirling_download with the fileId.");
        } else if ("text".equals(McpZipParts.outputKind(file.contentType(), file.name()))) {
            text.append(" To read its text yourself, call stirling_download with the fileId.");
        }
        ObjectNode result =
                file.inline() == null
                        ? text(mapper, text.toString())
                        : result(
                                mapper,
                                false,
                                textBlock(mapper, text.toString()),
                                resourceBlock(
                                        mapper,
                                        "stirling://file/" + file.fileId(),
                                        file.contentType(),
                                        Base64.getEncoder().encodeToString(file.inline())));
        ObjectNode card = result.putObject("structuredContent");
        card.put("kind", "file");
        card.put("operation", operation);
        card.put("outputKind", McpZipParts.outputKind(file.contentType(), file.name()));
        card.put("fileId", file.fileId());
        card.put("fileName", file.name());
        if (file.contentType() != null) {
            card.put("mimeType", file.contentType());
        }
        card.put("size", file.size());
        if (file.downloadUrl() != null) {
            card.put("downloadUrl", file.downloadUrl());
        }
        if (file.openUrl() != null) {
            card.put("openUrl", file.openUrl());
        }
        return result;
    }

    /** A slow operation is still running; the client polls stirling_job_status with the id. */
    public static ObjectNode pending(ObjectMapper mapper, String operation, String jobId) {
        ObjectNode result =
                text(
                        mapper,
                        operation
                                + " is still running (jobId "
                                + jobId
                                + "). Call stirling_job_status with this jobId in about 30 seconds"
                                + " to get the result; tell the user it is still working.");
        ObjectNode card = result.putObject("structuredContent");
        card.put("kind", "pending");
        card.put("operation", operation);
        card.put("jobId", jobId);
        return result;
    }

    /** Page count for the model and card; the thumbnail rides in _meta, kept from the model. */
    public static void addPreview(ObjectNode result, McpPreview.Preview preview) {
        if (preview == null || !(result.get("structuredContent") instanceof ObjectNode card)) {
            return;
        }
        card.put("pageCount", preview.pageCount());
        if (preview.imageDataUrl() != null) {
            ObjectNode meta =
                    result.get("_meta") instanceof ObjectNode existing
                            ? existing
                            : result.putObject("_meta");
            meta.put("stirling/preview", preview.imageDataUrl());
        }
    }

    static String humanSize(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        }
        if (bytes < 1024 * 1024) {
            return String.format(Locale.ROOT, "%.1f KB", bytes / 1024.0);
        }
        return String.format(Locale.ROOT, "%.1f MB", bytes / (1024.0 * 1024));
    }

    /** MRTR interim result asking the client to show a form and retry with the answers. */
    public static ObjectNode inputRequired(
            ObjectMapper mapper, String key, ObjectNode elicitParams) {
        return inputRequired(mapper, key, "elicitation/create", elicitParams);
    }

    /** As above with a named method, e.g. ChatGPT's {@code openai/elicitation/create}. */
    public static ObjectNode inputRequired(
            ObjectMapper mapper, String key, String method, ObjectNode elicitParams) {
        ObjectNode result = mapper.createObjectNode();
        result.put("resultType", "input_required");
        ObjectNode request = result.putObject("inputRequests").putObject(key);
        request.put("method", method);
        request.set("params", elicitParams);
        return result;
    }

    /** A JSON report (e.g. get-info) as text, plus the parsed data for agents and the card. */
    public static ObjectNode report(ObjectMapper mapper, String operation, String json) {
        String failure = reportFailure(mapper, json);
        if (failure != null) {
            return error(
                    mapper,
                    operation + " could not read the file: " + failure,
                    Failure.INPUT_UNAVAILABLE);
        }
        ObjectNode result = text(mapper, json);
        ObjectNode card = result.putObject("structuredContent");
        card.put("kind", "report");
        card.put("operation", operation);
        card.put("outputKind", "report");
        try {
            JsonNode parsed = mapper.readTree(json);
            card.set("report", parsed);
            if (parsed.isArray()) {
                // An empty list is easy to misread; say plainly that nothing was found.
                card.put("count", parsed.size());
                if (parsed.isEmpty()) {
                    result.set(
                            "content",
                            text(
                                            mapper,
                                            operation
                                                    + " found nothing: the result is an empty list (count 0).")
                                    .get("content"));
                }
            }
        } catch (RuntimeException e) {
            // Not valid JSON after all: the text block still carries it.
        }
        return result;
    }

    /** Some endpoints answer 200 with only {error, timestamp}; that is a failure, not a report. */
    private static String reportFailure(ObjectMapper mapper, String json) {
        try {
            JsonNode node = mapper.readTree(json);
            if (!node.isObject() || !node.path("error").isTextual()) {
                return null;
            }
            for (String key : node.propertyNames()) {
                if (!key.equals("error") && !key.equals("timestamp")) {
                    return null;
                }
            }
            return node.get("error").asText();
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** An operation that finished without a file (e.g. no tables to export); not a failure. */
    public static ObjectNode noOutput(ObjectMapper mapper, String operation, String reason) {
        ObjectNode result = text(mapper, operation + " finished with no output: " + reason);
        ObjectNode card = result.putObject("structuredContent");
        card.put("kind", "report");
        card.put("operation", operation);
        card.put("outputKind", "none");
        card.putObject("report").put("output", false).put("reason", reason);
        return result;
    }

    /** Lists a ZIP result's stored files in the text and structured content. */
    static void addParts(ObjectNode result, McpZipParts.Unpacked unpacked) {
        if (unpacked.parts().isEmpty()) {
            appendText(result, " The ZIP is empty.");
            return;
        }
        ObjectNode card = (ObjectNode) result.get("structuredContent");
        StringBuilder text =
                new StringBuilder(" It holds ")
                        .append(unpacked.total())
                        .append(unpacked.total() == 1 ? " file" : " files")
                        .append(", each stored on its own for the next step:");
        ArrayNode list = card.putArray("parts");
        for (McpZipParts.Part part : unpacked.parts()) {
            list.addObject()
                    .put("fileId", part.fileId())
                    .put("name", part.name())
                    .put("size", part.size())
                    .put("outputKind", McpZipParts.outputKind(part.contentType(), part.name()));
            text.append(' ')
                    .append(part.name())
                    .append(" (fileId=")
                    .append(part.fileId())
                    .append("),");
        }
        text.setLength(text.length() - 1);
        text.append('.');
        if (unpacked.parts().size() < unpacked.total()) {
            text.append(" Only the first ").append(unpacked.parts().size()).append(" were stored.");
        }
        card.put("partCount", unpacked.total());
        appendText(result, text.toString());
    }

    private static void appendText(ObjectNode result, String suffix) {
        JsonNode first = result.path("content").path(0);
        if (first instanceof ObjectNode block && block.has("text")) {
            block.put("text", block.get("text").asText() + suffix);
        }
    }

    /** The user's files as text for the model plus a list the widget renders. */
    public static ObjectNode fileList(ObjectMapper mapper, String kind, List<Listed> files) {
        StringBuilder text = new StringBuilder();
        if (files.isEmpty()) {
            text.append("No stored files found. Use stirling_select_file to upload one.");
        } else {
            text.append("The user's Stirling files, newest first:");
            for (Listed f : files) {
                text.append("\n- ")
                        .append(f.name())
                        .append(" (")
                        .append(humanSize(f.size()))
                        .append(", fileId=")
                        .append(f.fileId())
                        .append(')');
            }
        }
        ObjectNode result = text(mapper, text.toString());
        ObjectNode structured = result.putObject("structuredContent");
        structured.put("kind", kind);
        ArrayNode list = structured.putArray("files");
        for (Listed f : files) {
            ObjectNode item = list.addObject();
            item.put("fileId", f.fileId());
            item.put("name", f.name());
            item.put("size", f.size());
            if (f.contentType() != null) {
                item.put("contentType", f.contentType());
            }
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
