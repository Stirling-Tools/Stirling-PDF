package stirling.software.proprietary.mcp.tools;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClientResponseException;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.AutomationRunContext;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.InternalApiTimeoutException;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpJobs;
import stirling.software.proprietary.mcp.catalog.OperationMeta;
import stirling.software.proprietary.mcp.files.McpFileUrlFetcher;
import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.mcp.files.McpPreview;
import stirling.software.proprietary.security.model.User;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Runs an operation over the loopback and stores the result as a temporary file. */
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpOperationExecutor {

    private static final String COMPLIANCE_OP = "validate-compliance";
    // Set by the redaction endpoints (RedactController.MATCHES_HEADER).
    private static final String REDACTION_MATCHES_HEADER = "X-Stirling-Redaction-Matches";
    private static final long GROWTH_WARN_FACTOR = 10;
    private static final long MIN_WARN_BYTES = 512 * 1024;
    // ErrorCode.COMPLIANCE_NOT_MET, sent as the problem's errorCode.
    private static final String COMPLIANCE_NOT_MET = "E074";

    private final ObjectMapper mapper;
    private final InternalApiClient internalApiClient;
    private final McpFiles files;
    private final McpFileUrlFetcher fileUrlFetcher;
    private final McpPreview preview;
    private final McpJobs jobs;

    public McpOperationExecutor(
            ObjectMapper mapper,
            InternalApiClient internalApiClient,
            McpFiles files,
            McpFileUrlFetcher fileUrlFetcher,
            McpPreview preview,
            McpJobs jobs) {
        this.mapper = mapper;
        this.internalApiClient = internalApiClient;
        this.files = files;
        this.fileUrlFetcher = fileUrlFetcher;
        this.preview = preview;
        this.jobs = jobs;
    }

    public ObjectNode execute(OperationMeta meta, JsonNode arguments, McpCallContext context) {
        // Ask for passwords before fetching any input, so a prompt costs no download.
        McpPasswordPrompt.Outcome secrets =
                McpPasswordPrompt.apply(
                        mapper,
                        meta,
                        arguments == null ? null : arguments.get("parameters"),
                        context);
        if (secrets.response() != null) {
            return secrets.response();
        }
        if (jobs == null) {
            return run(meta, arguments, context, secrets.parameters());
        }
        String owner = context == null ? null : context.stirlingUserId();
        return jobs.run(
                meta.id(), owner, () -> run(meta, arguments, context, secrets.parameters()));
    }

    private ObjectNode run(
            OperationMeta meta, JsonNode arguments, McpCallContext context, JsonNode parameters) {
        User user = files.user(context);
        Inputs inputs =
                McpFileParameters.takesFile(meta)
                        ? resolveInputs(arguments, user)
                        : new Inputs(List.of(), null);
        if (inputs.error() != null) {
            return inputs.error();
        }
        Call call = call(meta, inputs.files(), parameters, user);
        if (call.finding() != null) {
            return call.finding();
        }
        if (call.error() != null) {
            return call.error();
        }
        ObjectNode result = buildResult(meta, call.response(), user, context);
        addRedactionCount(result, call.response());
        McpResultNotes.apply(mapper, meta, result, call.response().getHeaders(), parameters);
        if (COMPLIANCE_OP.equals(meta.id())) {
            markCompliant(result);
        } else {
            warnIfMuchLarger(result, inputs.files());
        }
        return result;
    }

    /**
     * Runs {@code steps} in order on one input, each step's file feeding the next, as one job.
     * Passwords for every step are asked for together before anything runs.
     */
    public ObjectNode executePipeline(
            List<McpPipelineStep> steps, JsonNode arguments, McpCallContext context) {
        List<JsonNode> parameters = new ArrayList<>();
        ObjectNode prompts = null;
        for (int i = 0; i < steps.size(); i++) {
            McpPipelineStep step = steps.get(i);
            McpPasswordPrompt.Outcome secrets =
                    McpPasswordPrompt.apply(
                            mapper,
                            step.meta(),
                            step.parameters(),
                            context,
                            McpPasswordPrompt.INPUT_KEY + "_" + i);
            ObjectNode response = secrets.response();
            if (response != null
                    && !"input_required".equals(response.path("resultType").asText())) {
                return response;
            }
            if (response != null) {
                if (prompts == null) {
                    prompts = response;
                } else {
                    ((ObjectNode) prompts.get("inputRequests"))
                            .setAll((ObjectNode) response.get("inputRequests"));
                }
            }
            parameters.add(secrets.parameters());
        }
        if (prompts != null) {
            return prompts;
        }
        String label = steps.get(steps.size() - 1).meta().id();
        if (jobs == null) {
            return runPipeline(steps, parameters, arguments, context);
        }
        String owner = context == null ? null : context.stirlingUserId();
        return jobs.run(label, owner, () -> runPipeline(steps, parameters, arguments, context));
    }

    private ObjectNode runPipeline(
            List<McpPipelineStep> steps,
            List<JsonNode> parameters,
            JsonNode arguments,
            McpCallContext context) {
        User user = files.user(context);
        Inputs resolved = resolveInputs(arguments, user);
        if (resolved.error() != null) {
            return resolved.error();
        }
        // One run id, so SaaS bills the whole pipeline as one automation run.
        try (AutomationRunContext.Scope run =
                AutomationRunContext.open(UUID.randomUUID().toString())) {
            return runSteps(steps, parameters, resolved.files(), user, context);
        }
    }

    /**
     * Runs the steps like the pipeline engine: a step that makes several files (a split) passes
     * each one on, a single-file step runs once per file, and a multi-file step (merge) takes all.
     */
    private ObjectNode runSteps(
            List<McpPipelineStep> steps,
            List<JsonNode> parameters,
            List<McpInputFiles.Input> inputs,
            User user,
            McpCallContext context) {
        List<McpInputFiles.Input> current = inputs;
        for (int i = 0; i < steps.size(); i++) {
            OperationMeta meta = steps.get(i).meta();
            String where = "Step " + (i + 1) + " of " + steps.size() + " (" + meta.id() + "): ";
            boolean last = i == steps.size() - 1;
            List<List<McpInputFiles.Input>> batches =
                    acceptsManyFiles(meta) || current.size() <= 1
                            ? List.of(current)
                            : current.stream().map(List::of).toList();
            if (last && batches.size() == 1) {
                Call call = call(meta, batches.get(0), parameters.get(i), user);
                if (call.error() != null) {
                    return McpResponses.prefixError(call.error(), where);
                }
                ObjectNode result = buildResult(meta, call.response(), user, context);
                McpResultNotes.apply(
                        mapper, meta, result, call.response().getHeaders(), parameters.get(i));
                prefixText(result, "Ran " + stepCount(steps) + ": " + stepIds(steps) + ". ");
                return result;
            }
            List<McpInputFiles.Input> next = new ArrayList<>();
            for (List<McpInputFiles.Input> batch : batches) {
                String on = batches.size() > 1 ? "on " + batch.get(0).name() + ": " : "";
                Call call = call(meta, batch, parameters.get(i), user);
                if (call.error() != null) {
                    return McpResponses.prefixError(call.error(), where + on);
                }
                List<McpInputFiles.Input> produced = new ArrayList<>();
                String problem = filesFrom(meta, call.response(), produced);
                if (problem != null) {
                    return McpResponses.error(mapper, where + on + problem);
                }
                next.addAll(produced);
                if (next.size() > McpZipParts.MAX_PARTS) {
                    return McpResponses.error(
                            mapper,
                            where
                                    + "the pipeline would carry more than "
                                    + McpZipParts.MAX_PARTS
                                    + " files. Run it on fewer files at a time.");
                }
            }
            if (last) {
                return storedFiles(steps, next, user);
            }
            current = next;
        }
        return McpResponses.error(mapper, "The pipeline has no steps.");
    }

    private static String stepCount(List<McpPipelineStep> steps) {
        return steps.size() == 1 ? "1 step" : steps.size() + " steps";
    }

    /** A step's files for the next step: a ZIP becomes its files; a report can't be passed on. */
    private String filesFrom(
            OperationMeta meta, ResponseEntity<Resource> response, List<McpInputFiles.Input> out) {
        Resource body = response.getBody();
        MediaType type = response.getHeaders().getContentType();
        if (body == null || response.getStatusCode().value() == 204 || contentLength(body) == 0) {
            return "finished with no output: " + noOutputReason(meta.id());
        }
        if (type != null && MediaType.APPLICATION_JSON.isCompatibleWith(type)) {
            return "returns a report, not a file, so it can only be the last step and only on"
                    + " one file.";
        }
        String name = body.getFilename() == null ? meta.id() + ".pdf" : body.getFilename();
        try (InputStream in = body.getInputStream()) {
            byte[] bytes = in.readAllBytes();
            boolean zip =
                    name.toLowerCase(Locale.ROOT).endsWith(".zip")
                            || (type != null && type.toString().contains("zip"));
            if (zip) {
                out.addAll(McpZipParts.read(bytes));
            } else {
                out.add(new McpInputFiles.Input(bytes, name, null));
            }
            return null;
        } catch (IOException e) {
            return "could not carry its result on: " + e.getMessage() + ".";
        }
    }

    /** Several final files: each stored with its own link, listed together. */
    private ObjectNode storedFiles(
            List<McpPipelineStep> steps, List<McpInputFiles.Input> outputs, User user) {
        StringBuilder text =
                new StringBuilder("Ran ")
                        .append(stepCount(steps))
                        .append(": ")
                        .append(stepIds(steps))
                        .append(". It made ")
                        .append(outputs.size())
                        .append(outputs.size() == 1 ? " file:" : " files:");
        ObjectNode result = McpResponses.text(mapper, "");
        ObjectNode card = result.putObject("structuredContent");
        card.put("kind", "files");
        ArrayNode list = card.putArray("files");
        try {
            for (McpInputFiles.Input output : outputs) {
                McpFiles.Saved saved =
                        files.save(
                                user,
                                output.bytes(),
                                output.name(),
                                McpZipParts.mimeFor(output.name()),
                                true);
                ObjectNode item =
                        list.addObject()
                                .put("fileId", saved.fileId())
                                .put("name", saved.name())
                                .put("size", saved.size());
                text.append(' ').append(saved.name()).append(" (fileId=").append(saved.fileId());
                if (saved.downloadUrl() != null) {
                    item.put("downloadUrl", saved.downloadUrl());
                    text.append(", ").append(saved.downloadUrl());
                }
                text.append(')');
            }
        } catch (McpFiles.McpFileException e) {
            return McpResponses.error(
                    mapper,
                    "The pipeline ran but " + e.getMessage(),
                    McpResponses.Failure.STORAGE_FAILED);
        }
        ((ObjectNode) result.path("content").path(0)).put("text", text.toString());
        return result;
    }

    private static String stepIds(List<McpPipelineStep> steps) {
        return String.join(" > ", steps.stream().map(s -> s.meta().id()).toList());
    }

    private static void prefixText(ObjectNode result, String prefix) {
        JsonNode first = result.path("content").path(0);
        if (first instanceof ObjectNode block && block.has("text")) {
            block.put("text", prefix + block.get("text").asText());
        }
    }

    private record Inputs(List<McpInputFiles.Input> files, ObjectNode error) {}

    /** A response, or an error; {@code finding} is set when a lone call should report, not fail. */
    private record Call(ResponseEntity<Resource> response, ObjectNode error, ObjectNode finding) {
        Call(ResponseEntity<Resource> response, ObjectNode error) {
            this(response, error, null);
        }
    }

    private Inputs resolveInputs(JsonNode arguments, User user) {
        List<McpInputFiles.Input> inputs = new ArrayList<>();
        List<McpInputFiles.Input> listed = McpInputFiles.resolveList(arguments, files, user);
        if (McpInputFiles.hasSingle(arguments) || listed.isEmpty()) {
            inputs.add(McpInputFiles.resolve(arguments, files, user, fileUrlFetcher, "input.pdf"));
        }
        inputs.addAll(listed);
        for (McpInputFiles.Input input : inputs) {
            if (input.error() != null) {
                return new Inputs(
                        null,
                        McpResponses.error(
                                mapper, input.error(), McpResponses.Failure.INPUT_UNAVAILABLE));
            }
        }
        return new Inputs(inputs, null);
    }

    private Call call(
            OperationMeta meta, List<McpInputFiles.Input> inputs, JsonNode parameters, User user) {
        Set<String> fileFields = McpFileParameters.fileFields(meta.paramSchema());
        if (inputs.size() > 1 && !acceptsManyFiles(meta)) {
            // A second file usually belongs in the operation's own file parameter, not a merge.
            String advice =
                    fileFields.isEmpty()
                            ? "Pass just one, or combine them first with merge-pdfs."
                            : "Pass the document as fileId and the other file by its fileId in"
                                    + " parameters."
                                    + String.join(" or parameters.", fileFields)
                                    + ".";
            return new Call(
                    null,
                    McpResponses.error(
                            mapper,
                            meta.id()
                                    + " takes one document but got "
                                    + inputs.size()
                                    + ". "
                                    + advice,
                            McpResponses.Failure.INVALID_PARAMETERS));
        }

        String listInput = McpFileParameters.listInput(meta.paramSchema());
        List<String> problems =
                McpParameterCheck.problems(
                        meta.paramSchema(), parameters, inputs.isEmpty() ? null : listInput);
        if (!problems.isEmpty()) {
            String signature = McpOperationSignature.of(meta.paramSchema());
            return new Call(
                    null,
                    McpResponses.error(
                            mapper,
                            meta.id()
                                    + " was not run: "
                                    + String.join("; ", problems)
                                    + ". Fix the parameters"
                                    + (signature.isEmpty() ? "" : " " + signature)
                                    + " and retry.",
                            McpResponses.Failure.INVALID_PARAMETERS));
        }
        parameters = McpParameterCheck.canonical(meta.paramSchema(), parameters);
        if (McpMetadataKeep.OPERATION.equals(meta.id()) && inputs.size() == 1) {
            parameters =
                    McpMetadataKeep.withCurrentValues(mapper, parameters, inputs.get(0).bytes());
        }
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        String part = listInput != null ? listInput : McpFileParameters.inputPart(meta);
        for (McpInputFiles.Input input : inputs) {
            body.add(part, bytesResource(input.bytes(), input.name()));
        }
        String problem = addFileParameters(body, parameters, fileFields, user);
        if (problem != null) {
            return new Call(
                    null,
                    McpResponses.error(
                            mapper,
                            meta.id() + ": " + problem,
                            McpResponses.Failure.INPUT_UNAVAILABLE));
        }
        addParameters(body, parameters, fileFields);

        try {
            return new Call(internalApiClient.post(meta.endpointPath(), body), null);
        } catch (InternalApiTimeoutException e) {
            return new Call(
                    null,
                    McpResponses.error(
                            mapper,
                            meta.id()
                                    + " timed out after "
                                    + e.getReadTimeout().toSeconds()
                                    + "s. Try a smaller file or a different approach.",
                            McpResponses.Failure.TIMEOUT));
        } catch (RestClientResponseException e) {
            log.warn(
                    "MCP {} upstream error: HTTP {} - {}",
                    meta.id(),
                    e.getStatusCode().value(),
                    snippet(e.getResponseBodyAsString()));
            return new Call(null, upstreamError(meta, e), complianceFinding(meta, e));
        } catch (SecurityException e) {
            return new Call(
                    null,
                    McpResponses.error(
                            mapper,
                            meta.id() + " endpoint is not permitted for MCP dispatch.",
                            McpResponses.Failure.OPERATION_DISABLED));
        } catch (RuntimeException e) {
            String ref = newRef();
            log.warn("MCP execution of {} failed (ref {})", meta.id(), ref, e);
            ObjectNode error =
                    McpResponses.error(
                            mapper,
                            meta.id()
                                    + " failed unexpectedly (ref "
                                    + ref
                                    + "). See server logs for details.",
                            McpResponses.Failure.INTERNAL);
            McpResponses.errorDetail(error).put("ref", ref);
            return new Call(null, error);
        }
    }

    /** An upstream HTTP failure, classified: 4xx means fix the call, 5xx means tell the user. */
    private ObjectNode upstreamError(OperationMeta meta, RestClientResponseException e) {
        int status = e.getStatusCode().value();
        boolean clientError = status >= 400 && status < 500;
        McpResponses.Failure kind;
        if (status == 403) {
            kind = McpResponses.Failure.OPERATION_DISABLED;
        } else if (status == 429) {
            kind = McpResponses.Failure.RATE_LIMITED;
        } else if (clientError) {
            kind = McpResponses.Failure.INVALID_PARAMETERS;
        } else {
            kind = McpResponses.Failure.OPERATION_FAILED;
        }
        String message = upstreamFailure(meta, e);
        String ref = null;
        if (!clientError) {
            ref = newRef();
            log.warn("MCP {} upstream HTTP {} (ref {})", meta.id(), status, ref);
            message = message + " (ref " + ref + ")";
        }
        ObjectNode error = McpResponses.error(mapper, message, kind);
        ObjectNode detail = McpResponses.errorDetail(error);
        detail.put("httpStatus", status);
        if (ref != null) {
            detail.put("ref", ref);
        }
        return error;
    }

    /** A short id tying an error the user sees to the server log line. */
    private static String newRef() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    private ObjectNode buildResult(
            OperationMeta meta,
            ResponseEntity<Resource> response,
            User user,
            McpCallContext context) {
        Resource body = response.getBody();
        if (body == null || response.getStatusCode().value() == 204 || contentLength(body) == 0) {
            return McpResponses.noOutput(mapper, meta.id(), noOutputReason(meta.id()));
        }
        MediaType contentType = response.getHeaders().getContentType();

        // A JSON body is a structured report (e.g. get-info), not a file.
        if (contentType != null && MediaType.APPLICATION_JSON.isCompatibleWith(contentType)) {
            try (InputStream is = body.getInputStream()) {
                String json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                return McpResponses.report(mapper, meta.id(), json);
            } catch (IOException e) {
                return McpResponses.error(
                        mapper,
                        "Failed to read " + meta.id() + " result.",
                        McpResponses.Failure.INTERNAL);
            }
        }

        String filename =
                body.getFilename() == null || body.getFilename().isBlank()
                        ? meta.id()
                        : body.getFilename();
        String mimeType =
                contentType == null
                                || MediaType.APPLICATION_OCTET_STREAM.equalsTypeAndSubtype(
                                        contentType)
                        ? McpZipParts.mimeFor(filename)
                        : contentType.toString();
        try {
            McpFiles.Saved saved =
                    files.save(user, body, filename, mimeType, contentLength(body), true);
            ObjectNode result =
                    McpResponses.storedFile(
                            mapper, meta.id(), saved, context != null && context.rendersApps());
            // Size is checked first, so a large result is never read back just for a thumbnail.
            boolean previewable =
                    preview != null
                            && preview.fits(saved.size())
                            && saved.contentType() != null
                            && saved.contentType().startsWith(MediaType.APPLICATION_PDF_VALUE);
            if (previewable && preview.wanted(context)) {
                McpResponses.addPreview(result, preview.of(resultBytes(user, saved)));
            } else if (previewable) {
                Integer pages = preview.pageCount(resultBytes(user, saved));
                if (pages != null && result.get("structuredContent") instanceof ObjectNode card) {
                    card.put("pageCount", pages);
                }
            }
            if ("zip".equals(McpZipParts.outputKind(saved.contentType(), saved.name()))) {
                addZipParts(result, user, saved);
            }
            return result;
        } catch (McpFiles.McpFileException e) {
            return McpResponses.error(
                    mapper,
                    meta.id() + " succeeded but " + e.getMessage(),
                    McpResponses.Failure.STORAGE_FAILED);
        }
    }

    /** A "not compliant" answer is a finding for a lone check; pipelines still stop on it. */
    private ObjectNode complianceFinding(OperationMeta meta, RestClientResponseException e) {
        if (e.getStatusCode().value() != 422) {
            return null;
        }
        JsonNode body;
        try {
            body = mapper.readTree(e.getResponseBodyAsString());
        } catch (RuntimeException ex) {
            return null;
        }
        if (!COMPLIANCE_NOT_MET.equals(body.path("errorCode").asText())) {
            return null;
        }
        String detail = body.path("detail").asText("The document does not meet the standard.");
        ObjectNode result =
                McpResponses.text(
                        mapper, "Not compliant. " + detail.replace("; the run was stopped.", "."));
        ObjectNode card = result.putObject("structuredContent");
        card.put("kind", "report");
        card.put("operation", meta.id());
        card.put("outputKind", "report");
        card.putObject("report").put("compliant", false).put("detail", detail);
        return result;
    }

    /** Redaction reports how many matches it covered; zero must not read as success. */
    private static void addRedactionCount(ObjectNode result, ResponseEntity<Resource> response) {
        String header = response.getHeaders().getFirst(REDACTION_MATCHES_HEADER);
        if (header == null || !(result.get("structuredContent") instanceof ObjectNode card)) {
            return;
        }
        long matches;
        try {
            matches = Long.parseLong(header.trim());
        } catch (NumberFormatException e) {
            return;
        }
        card.putObject("redaction").put("matches", matches);
        if (matches == 0) {
            String warning =
                    "Nothing matched, so nothing was redacted. The file is unchanged; check the"
                            + " search text (and wholeWordSearch or regex) before telling the user"
                            + " it is redacted.";
            card.putArray("warnings").add(warning);
            JsonNode first = result.path("content").path(0);
            if (first instanceof ObjectNode block && block.has("text")) {
                block.put("text", "Warning: " + warning + " " + block.get("text").asText());
            }
        } else {
            JsonNode first = result.path("content").path(0);
            if (first instanceof ObjectNode block && block.has("text")) {
                block.put(
                        "text",
                        "Redacted " + matches + " match(es). " + block.get("text").asText());
            }
        }
    }

    /** Why an operation can finish with nothing to return, in words an agent can act on. */
    static String noOutputReason(String operation) {
        if (operation.equals("pdf-to-xlsx") || operation.equals("pdf-to-csv")) {
            return "no tables were found in the PDF. Use pdf-to-text, pdf-to-word or"
                    + " pdf-to-markdown for plain text.";
        }
        if (operation.startsWith("filter-")) {
            return "the document did not match the filter, so it was left out.";
        }
        return "the operation produced no file for this input.";
    }

    /** Flags outputs many times their input, usually pages turned into images. */
    private static void warnIfMuchLarger(ObjectNode result, List<McpInputFiles.Input> inputs) {
        long in = inputs.stream().mapToLong(i -> i.bytes().length).sum();
        long out = result.path("structuredContent").path("size").asLong(-1);
        if (in <= 0 || out < MIN_WARN_BYTES || out < in * GROWTH_WARN_FACTOR) {
            return;
        }
        String warning =
                "The output is "
                        + (out / in)
                        + "x the input size ("
                        + McpResponses.humanSize(in)
                        + " to "
                        + McpResponses.humanSize(out)
                        + "), usually because pages were rendered as images or full fonts were"
                        + " embedded.";
        ((ObjectNode) result.get("structuredContent")).putArray("warnings").add(warning);
        JsonNode first = result.path("content").path(0);
        if (first instanceof ObjectNode block && block.has("text")) {
            block.put("text", block.get("text").asText() + " Warning: " + warning);
        }
    }

    private static void markCompliant(ObjectNode result) {
        if (result.path("isError").asBoolean(false)) {
            return;
        }
        if (result.get("structuredContent") instanceof ObjectNode card) {
            card.putObject("report").put("compliant", true);
        }
        JsonNode first = result.path("content").path(0);
        if (first instanceof ObjectNode block && block.has("text")) {
            block.put("text", "Compliant: the PDF meets PDF/A. " + block.get("text").asText());
        }
    }

    /** Stores the ZIP's files one by one so each can feed the next step by fileId. */
    private void addZipParts(ObjectNode result, User user, McpFiles.Saved zip) {
        if (zip.size() > McpZipParts.MAX_TOTAL_BYTES) {
            return;
        }
        byte[] bytes = resultBytes(user, zip);
        if (bytes == null) {
            return;
        }
        try {
            McpZipParts.Unpacked unpacked = McpZipParts.unpack(files, user, bytes);
            McpResponses.addParts(result, unpacked);
        } catch (IOException | McpFiles.McpFileException e) {
            log.debug("Could not unpack MCP ZIP result {}: {}", zip.fileId(), e.getMessage());
        }
    }

    // Multi-file endpoints bind fileInput (or their only file list) to an array.
    private static boolean acceptsManyFiles(OperationMeta meta) {
        return McpFileParameters.acceptsManyFiles(meta.paramSchema());
    }

    private byte[] resultBytes(User user, McpFiles.Saved saved) {
        if (saved.inline() != null) {
            return saved.inline();
        }
        try {
            return files.load(user, saved.fileId()).bytes();
        } catch (McpFiles.McpFileException e) {
            return null;
        }
    }

    private static long contentLength(Resource body) {
        try {
            return body.contentLength();
        } catch (IOException e) {
            return -1;
        }
    }

    /** Loads fileIds given for file parameters (e.g. overlayFiles) and attaches the files. */
    private String addFileParameters(
            MultiValueMap<String, Object> body,
            JsonNode params,
            Set<String> fileFields,
            User user) {
        if (params == null || !params.isObject()) {
            return null;
        }
        for (String field : fileFields) {
            JsonNode value = params.get(field);
            if (value == null || value.isNull()) {
                continue;
            }
            List<JsonNode> ids = new ArrayList<>();
            if (value.isArray()) {
                value.forEach(ids::add);
            } else {
                ids.add(value);
            }
            for (JsonNode id : ids) {
                if (!id.isTextual() || id.asText().isBlank()) {
                    return "'" + field + "' takes fileIds of files already in Stirling.";
                }
                try {
                    McpFiles.Loaded loaded = files.load(user, id.asText());
                    body.add(field, bytesResource(loaded.bytes(), loaded.name()));
                } catch (McpFiles.McpFileException e) {
                    return "'" + field + "': " + e.getMessage();
                }
            }
        }
        return null;
    }

    private void addParameters(
            MultiValueMap<String, Object> body, JsonNode params, Set<String> fileFields) {
        if (params == null || !params.isObject()) {
            return;
        }
        Map<String, Object> map =
                mapper.convertValue(params, new TypeReference<Map<String, Object>>() {});
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            Object value = entry.getValue();
            if (value == null || fileFields.contains(entry.getKey())) {
                continue;
            }
            if (value instanceof List<?> list) {
                if (list.isEmpty()) {
                    // Spring's field marker binds an empty list, which differs from leaving it out.
                    body.add("_" + entry.getKey(), "");
                } else if (containsStructured(list)) {
                    body.add(entry.getKey(), mapper.writeValueAsString(list));
                } else {
                    list.forEach(item -> body.add(entry.getKey(), item));
                }
            } else if (value instanceof Map<?, ?>) {
                body.add(entry.getKey(), mapper.writeValueAsString(value));
            } else {
                body.add(entry.getKey(), value);
            }
        }
    }

    private static boolean containsStructured(List<?> list) {
        return list.stream().anyMatch(item -> item instanceof Map<?, ?> || item instanceof List<?>);
    }

    private static Resource bytesResource(byte[] bytes, String filename) {
        return new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }

    // Tell the model why and what to do next, so it retries with Stirling instead of improvising.
    private String upstreamFailure(OperationMeta meta, RestClientResponseException e) {
        int status = e.getStatusCode().value();
        StringBuilder message =
                new StringBuilder(meta.id()).append(" failed (HTTP ").append(status).append(')');
        String reason = upstreamReason(e.getResponseBodyAsString());
        if (reason != null) {
            message.append(": ").append(reason);
        }
        if (status >= 400 && status < 500) {
            String signature = McpOperationSignature.of(meta.paramSchema());
            message.append(". Check the input file and parameters");
            if (!signature.isEmpty()) {
                message.append(' ').append(signature);
            }
            message.append(", then retry with Stirling PDF.");
        } else {
            message.append(". Stirling PDF could not process this file; tell the user.");
        }
        return message.toString();
    }

    /** The error's own message from a JSON body, never raw HTML or stack traces. */
    private String upstreamReason(String body) {
        if (body == null || body.isBlank() || !body.strip().startsWith("{")) {
            return null;
        }
        try {
            JsonNode json = mapper.readTree(body);
            for (String field : List.of("detail", "message", "error")) {
                String text = json.path(field).asText("").strip();
                if (!text.isEmpty()) {
                    String oneLine = text.replaceAll("\\s+", " ");
                    return oneLine.length() > 200 ? oneLine.substring(0, 200) + "..." : oneLine;
                }
            }
        } catch (RuntimeException ignored) {
            // Not JSON after all: the status alone has to do.
        }
        return null;
    }

    private static String snippet(String body) {
        if (body == null || body.isBlank()) {
            return "(no body)";
        }
        String trimmed = body.strip();
        return trimmed.length() > 300 ? trimmed.substring(0, 300) + "..." : trimmed;
    }
}
