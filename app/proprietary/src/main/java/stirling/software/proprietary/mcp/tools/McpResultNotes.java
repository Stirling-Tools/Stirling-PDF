package stirling.software.proprietary.mcp.tools;

import org.springframework.http.HttpHeaders;

import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** What an operation reports beside its file, put where the model reads it before replying. */
final class McpResultNotes {

    // Set by AI tools (AiToolResponseHeaders.TOOL_REPORT) as a small JSON object.
    static final String TOOL_REPORT = "X-Stirling-Tool-Report";
    // Set by pdf-to-ua (ConvertPdfToPdfUa).
    static final String UA_DECLARED = "X-Stirling-UA-Declared";
    static final String UA_FAILURES = "X-Stirling-UA-Failures";
    static final String UA_ALT_NEEDED = "X-Stirling-UA-Figures-Needing-Alt";
    private static final int MAX_REPORT_TEXT = 300;

    private McpResultNotes() {}

    static void apply(
            ObjectMapper mapper,
            OperationMeta meta,
            ObjectNode result,
            HttpHeaders headers,
            JsonNode parameters) {
        if (result.path("isError").asBoolean(false)
                || !(result.get("structuredContent") instanceof ObjectNode card)) {
            return;
        }
        toolReport(mapper, meta, result, card, headers);
        accessibility(result, card, headers);
        if ("add-password".equals(meta.id()) && !hasText(parameters, "password")) {
            warn(
                    result,
                    card,
                    hasText(parameters, "ownerPassword")
                            ? "No open password was set, so anyone can open the file; only"
                                    + " changing its restrictions needs the owner password."
                            : "No password was set, so the file opens without one and most"
                                    + " readers ignore its restrictions. Do not call it password"
                                    + " protected.");
        }
    }

    private static void toolReport(
            ObjectMapper mapper,
            OperationMeta meta,
            ObjectNode result,
            ObjectNode card,
            HttpHeaders headers) {
        String header = headers == null ? null : headers.getFirst(TOOL_REPORT);
        if (header == null || header.isBlank()) {
            return;
        }
        JsonNode report;
        try {
            report = mapper.readTree(header);
        } catch (RuntimeException e) {
            return;
        }
        if (!report.isObject()) {
            return;
        }
        card.set("report", report);
        if ("pdf-comment-agent".equals(meta.id())
                && report.path("annotationsApplied").asInt(-1) == 0) {
            warn(result, card, "No comments were added, so the file is unchanged.");
            return;
        }
        String summary = report.toString();
        prefix(
                result,
                "Report: "
                        + (summary.length() > MAX_REPORT_TEXT
                                ? summary.substring(0, MAX_REPORT_TEXT) + "..."
                                : summary)
                        + ". ");
    }

    /** pdf-to-ua only claims conformance when it passes; say so when it did not. */
    private static void accessibility(ObjectNode result, ObjectNode card, HttpHeaders headers) {
        String declared = headers == null ? null : headers.getFirst(UA_DECLARED);
        if (declared == null) {
            return;
        }
        int failures = number(headers.getFirst(UA_FAILURES));
        int figures = number(headers.getFirst(UA_ALT_NEEDED));
        card.putObject("report")
                .put("declared", Boolean.parseBoolean(declared))
                .put("failures", failures)
                .put("figuresNeedingAlt", figures);
        if (!Boolean.parseBoolean(declared)) {
            warn(
                    result,
                    card,
                    "The file is tagged but not declared PDF/UA: "
                            + figures
                            + " figure(s) need alt text and "
                            + failures
                            + " check(s) failed. Run accessibility-report for the figure keys,"
                            + " then run pdf-to-ua again with altText lines (key=description), or"
                            + " figurePolicy mark-decorative. Do not call it accessible yet.");
        }
    }

    private static int number(String value) {
        try {
            return value == null ? 0 : Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static boolean hasText(JsonNode parameters, String field) {
        return parameters != null
                && parameters.hasNonNull(field)
                && !parameters.get(field).asText().isEmpty();
    }

    private static void warn(ObjectNode result, ObjectNode card, String warning) {
        ArrayNode warnings =
                card.get("warnings") instanceof ArrayNode list ? list : card.putArray("warnings");
        warnings.add(warning);
        prefix(result, "Warning: " + warning + " ");
    }

    private static void prefix(ObjectNode result, String text) {
        JsonNode first = result.path("content").path(0);
        if (first instanceof ObjectNode block && block.has("text")) {
            block.put("text", text + block.get("text").asText());
        }
    }
}
