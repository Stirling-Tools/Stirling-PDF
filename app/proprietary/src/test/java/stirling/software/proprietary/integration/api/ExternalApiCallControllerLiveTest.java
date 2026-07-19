package stirling.software.proprietary.integration.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.purview.PdfSensitivityLabels;
import stirling.software.proprietary.integration.purview.SensitivityLabel;
import stirling.software.proprietary.integration.purview.SensitivityLabel.AssignmentMethod;
import stirling.software.proprietary.service.AiToolResponseHeaders;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Drives the real {@link ExternalApiCallController} against a real HTTP server on loopback.
 *
 * <p>Everything below the connection lookup is genuine: a real PDF, real context extraction, real
 * placeholder resolution, a real JDK HTTP client, and a real receiver that records exactly what
 * arrived. Only {@link ApiConnectionResolver} is stubbed - resolving a connection means a database
 * and an authorization check, which belong to their own tests.
 *
 * <p>The receiver is the point. Asserting what a third party actually received is the only way to
 * know the document and its context left in the shape an integration expects; asserting our own
 * intentions would pass just as happily with the bytes never leaving.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ExternalApiCallControllerLiveTest {

    @Mock private ApiConnectionResolver connectionResolver;

    private HttpServer server;
    private String baseUrl;
    private ExternalApiCallController controller;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ApplicationProperties properties = new ApplicationProperties();

    /** What the receiver saw, so assertions are about the wire rather than our intentions. */
    private volatile String receivedBody;

    private volatile String receivedContentType;
    private volatile String receivedMethod;
    private final Map<String, String> receivedHeaders = new LinkedHashMap<>();

    @BeforeEach
    void startReceiver() throws IOException {
        // Loopback is exactly what the host guard blocks by default; an operator opts in for an
        // on-prem integration, which is what a local receiver stands in for.
        properties.getPolicies().setAllowPrivateApiEndpoints(true);

        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);

        // Records, then answers with a verdict - the DLP/scanner shape.
        server.createContext(
                "/v1/scan",
                exchange -> {
                    capture(exchange);
                    respond(
                            exchange,
                            200,
                            "application/json",
                            "{\"verdict\":\"clean\",\"score\":0.02}"
                                    .getBytes(StandardCharsets.UTF_8));
                });

        // Answers with a different document - the converter shape.
        server.createContext(
                "/v1/convert",
                exchange -> {
                    capture(exchange);
                    exchange.getResponseHeaders()
                            .add("Content-Disposition", "attachment; filename=\"converted.docx\"");
                    respond(
                            exchange,
                            200,
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            "DOCX-BYTES".getBytes(StandardCharsets.UTF_8));
                });

        // Answers with a link to the result - the async/large-file shape.
        server.createContext(
                "/v1/deferred",
                exchange -> {
                    capture(exchange);
                    respond(
                            exchange,
                            200,
                            "application/json",
                            ("{\"status\":\"done\",\"data\":{\"downloadUrl\":\""
                                            + baseUrl
                                            + "/files/result.pdf\"}}")
                                    .getBytes(StandardCharsets.UTF_8));
                });

        // Answers with a link on a host the connection never authorised.
        server.createContext(
                "/v1/evil",
                exchange -> {
                    capture(exchange);
                    respond(
                            exchange,
                            200,
                            "application/json",
                            "{\"data\":{\"downloadUrl\":\"http://169.254.169.254/latest/meta-data/\"}}"
                                    .getBytes(StandardCharsets.UTF_8));
                });

        server.createContext(
                "/files/result.pdf",
                exchange ->
                        respond(
                                exchange,
                                200,
                                "application/pdf",
                                "%PDF-1.7 fetched".getBytes(StandardCharsets.UTF_8)));

        // Answers with an archive - ConsignO's "PDF (single) or ZIP (multiple)" shape.
        server.createContext(
                "/v1/bundle",
                exchange -> {
                    capture(exchange);
                    respond(exchange, 200, "application/zip", zip());
                });

        server.createContext(
                "/v1/reject",
                exchange -> {
                    capture(exchange);
                    respond(
                            exchange,
                            422,
                            "application/json",
                            "{\"error\":\"policy violation\"}".getBytes(StandardCharsets.UTF_8));
                });

        // Cloudmersive's scan shape: HTTP 200 with the verdict in the body, clean or not.
        server.createContext(
                "/v1/clean",
                exchange -> {
                    capture(exchange);
                    respond(
                            exchange,
                            200,
                            "application/json",
                            "{\"CleanResult\":true}".getBytes(StandardCharsets.UTF_8));
                });
        server.createContext(
                "/v1/infected",
                exchange -> {
                    capture(exchange);
                    respond(
                            exchange,
                            200,
                            "application/json",
                            "{\"CleanResult\":false,\"FoundViruses\":[{\"VirusName\":\"EICAR\"}]}"
                                    .getBytes(StandardCharsets.UTF_8));
                });

        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();

        ExternalApiCaller caller =
                new ExternalApiCaller(
                        HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build(),
                        properties,
                        objectMapper);
        controller =
                new ExternalApiCallController(
                        connectionResolver,
                        caller,
                        objectMapper,
                        new TempFileManager(new TempFileRegistry(), properties),
                        properties);
    }

    @AfterEach
    void stopReceiver() {
        server.stop(0);
    }

    private void capture(HttpExchange exchange) throws IOException {
        receivedMethod = exchange.getRequestMethod();
        receivedBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        receivedContentType = exchange.getRequestHeaders().getFirst("Content-Type");
        exchange.getRequestHeaders()
                .forEach((name, values) -> receivedHeaders.put(name, values.get(0)));
    }

    private static void respond(HttpExchange exchange, int status, String contentType, byte[] body)
            throws IOException {
        exchange.getResponseHeaders().add("Content-Type", contentType);
        exchange.sendResponseHeaders(status, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private static byte[] zip() throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry("audit-trail.txt"));
            zip.write("who signed what".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("signed.pdf"));
            zip.write("%PDF-1.7 signed".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        return out.toByteArray();
    }

    /** A labelled, classified PDF, so the context has something real to carry. */
    private static MockMultipartFile pdf() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            document.addPage(new PDPage());
            document.getDocumentInformation().setTitle("Q3 Claim");
            document.getDocumentInformation()
                    .setCustomMetadataValue(
                            PdfMetadataService.CLASSIFICATION_KEY,
                            "{\"label\":\"invoice\",\"confidence\":0.91}");
            PdfSensitivityLabels.apply(
                    document,
                    new SensitivityLabel(
                            "2096f6a2-d2f7-48be-b329-b73aaa526e5d",
                            "Confidential",
                            "cb46c030-1825-4e81-a295-151c039dbf02",
                            AssignmentMethod.PRIVILEGED,
                            null,
                            null));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return new MockMultipartFile(
                    "fileInput", "claim.pdf", "application/pdf", out.toByteArray());
        }
    }

    private void connection(Map<String, Object> extra) {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("baseUrl", baseUrl);
        config.putAll(extra);
        when(connectionResolver.resolve(eq(7L))).thenReturn(ApiConnectionSettings.from(config));
        when(connectionResolver.resolveConfig(eq(7L), any(IntegrationType.class)))
                .thenReturn(config);
    }

    /**
     * The step's parameters, named. The controller takes seventeen positional arguments, which is
     * unreadable and easy to mis-order at a call site; this lets each test state only what it
     * varies.
     */
    private final class Step {
        private String path = "/v1/scan";
        private String method = "POST";
        private String bodyMode = "multipart";
        private String fileFieldName = "file";
        private String responseMode = "report";
        private String resultUrlPath;
        private String resultUrlHeader;
        private String responseSelect;
        private String requireTrue;
        private String fields;
        private String bodyTemplate;
        private String headers;
        private boolean includeContext;
        private boolean includeFile = true;
        private String policyName;
        private String runId;

        Step path(String v) {
            path = v;
            return this;
        }

        Step method(String v) {
            method = v;
            return this;
        }

        Step bodyMode(String v) {
            bodyMode = v;
            return this;
        }

        Step responseMode(String v) {
            responseMode = v;
            return this;
        }

        Step resultUrlPath(String v) {
            resultUrlPath = v;
            return this;
        }

        Step responseSelect(String v) {
            responseSelect = v;
            return this;
        }

        Step requireTrue(String v) {
            requireTrue = v;
            return this;
        }

        Step fields(String v) {
            fields = v;
            return this;
        }

        Step bodyTemplate(String v) {
            bodyTemplate = v;
            return this;
        }

        Step headers(String v) {
            headers = v;
            return this;
        }

        Step includeContext(boolean v) {
            includeContext = v;
            return this;
        }

        Step run(String policy, String id) {
            policyName = policy;
            runId = id;
            return this;
        }

        ResponseEntity<Resource> go() throws IOException {
            return controller.call(
                    pdf(),
                    "7",
                    path,
                    method,
                    bodyMode,
                    fileFieldName,
                    responseMode,
                    resultUrlPath,
                    resultUrlHeader,
                    responseSelect,
                    requireTrue,
                    fields,
                    bodyTemplate,
                    headers,
                    includeContext,
                    includeFile,
                    policyName,
                    runId);
        }
    }

    private Step step() {
        return new Step();
    }

    @Test
    void sendsTheDocumentAndWhatWeKnowAboutItToTheReceiver() throws IOException {
        connection(Map.of());

        ResponseEntity<Resource> response =
                step().path("/v1/scan")
                        .fields(
                                "{\"sha256\":\"{{document.sha256}}\",\"label\":\"{{sensitivityLabel.name}}\","
                                        + "\"class\":\"{{classification.label}}\",\"pages\":\"{{document.pageCount}}\"}")
                        .includeContext(true)
                        .run("Outbound review", "run-42")
                        .go();

        assertThat(receivedMethod).isEqualTo("POST");
        assertThat(receivedContentType).startsWith("multipart/form-data");
        // Fields the vendor asked for, filled from what Stirling already knew - no extra calls.
        assertThat(receivedBody).contains("name=\"label\"").contains("Confidential");
        assertThat(receivedBody).contains("name=\"class\"").contains("invoice");
        assertThat(receivedBody).contains("name=\"pages\"").contains("2");
        assertThat(receivedBody).containsPattern("name=\"sha256\"[\\s\\S]{0,24}[0-9a-f]{64}");
        // The document itself, under the field name the vendor expects.
        assertThat(receivedBody).contains("name=\"file\"; filename=\"claim.pdf\"").contains("%PDF");
        // The context, including which policy and run sent it.
        assertThat(receivedBody)
                .contains("stirlingContext")
                .contains("Outbound review")
                .contains("run-42");

        JsonNode report =
                objectMapper.readTree(
                        response.getHeaders().getFirst(AiToolResponseHeaders.TOOL_REPORT));
        assertThat(report.at("/status").asInt()).isEqualTo(200);
        assertThat(report.at("/body/verdict").asString()).isEqualTo("clean");
    }

    @Test
    void reportModeReturnsTheDocumentUntouched() throws IOException {
        connection(Map.of());

        ResponseEntity<Resource> response = step().path("/v1/scan").go();

        // Byte-for-byte: an inspecting call-out must not perturb what it inspected.
        assertThat(response.getBody().getInputStream().readAllBytes())
                .startsWith("%PDF".getBytes());
        assertThat(response.getHeaders().getFirst("Content-Disposition")).contains("claim.pdf");
    }

    @Test
    void replaceModeAdoptsTheReturnedDocumentAndItsRealName() throws IOException {
        connection(Map.of());

        ResponseEntity<Resource> response =
                step().path("/v1/convert").bodyMode("binary").responseMode("replace").go();

        assertThat(receivedContentType).isEqualTo("application/pdf");
        assertThat(receivedBody).startsWith("%PDF");
        assertThat(response.getBody().getInputStream().readAllBytes())
                .isEqualTo("DOCX-BYTES".getBytes(StandardCharsets.UTF_8));
        // Named for what came back, not what went out: a DOCX must not be called .pdf.
        assertThat(response.getHeaders().getFirst("Content-Disposition"))
                .contains("converted.docx");
    }

    @Test
    void followsAResultUrlOnTheConnectionsOwnHost() throws IOException {
        connection(Map.of());

        ResponseEntity<Resource> response =
                step().path("/v1/deferred")
                        .responseMode("replace")
                        .resultUrlPath("data.downloadUrl")
                        .go();

        assertThat(response.getBody().getInputStream().readAllBytes())
                .isEqualTo("%PDF-1.7 fetched".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void refusesAResultUrlTheConnectionNeverAuthorised() {
        connection(Map.of());

        // The URL is chosen by the remote service at run time; obeying it would be an SSRF.
        assertThatThrownBy(
                        () ->
                                step().path("/v1/evil")
                                        .responseMode("replace")
                                        .resultUrlPath("data.downloadUrl")
                                        .go())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("does not allow");
    }

    @Test
    void picksTheWantedFileOutOfAReturnedArchive() throws IOException {
        connection(Map.of());

        ResponseEntity<Resource> response =
                step().path("/v1/bundle").responseMode("replace").responseSelect("*.pdf").go();

        assertThat(response.getBody().getInputStream().readAllBytes())
                .isEqualTo("%PDF-1.7 signed".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void anUnselectedArchiveFailsRatherThanBecomingTheDocument() {
        connection(Map.of());

        // Handing a .zip to a step that expects a PDF fails later and more obscurely.
        assertThatThrownBy(() -> step().path("/v1/bundle").responseMode("replace").go())
                .isInstanceOf(IOException.class)
                .hasMessageContaining("responseSelect");
    }

    @Test
    void aRejectedCallOutFailsTheStep() {
        connection(Map.of());

        // A policy that continued past a rejection would deliver documents the external system
        // believes it never approved.
        assertThatThrownBy(() -> step().path("/v1/reject").go())
                .isInstanceOf(IOException.class)
                .hasMessageContaining("HTTP 422")
                .hasMessageContaining("policy violation");
    }

    @Test
    void aCleanVerdictLetsTheDocumentThrough() throws IOException {
        connection(Map.of());

        // Cloudmersive answers HTTP 200 whether clean or not; the verdict is in the body. A clean
        // result must pass the document through untouched.
        ResponseEntity<Resource> response =
                step().path("/v1/clean").requireTrue("CleanResult").go();

        assertThat(response.getBody().getInputStream().readAllBytes())
                .startsWith("%PDF".getBytes());
    }

    @Test
    void anInfectedVerdictStopsTheRunEvenOnHttp200() {
        connection(Map.of());

        // The whole security proposition: HTTP 200 with CleanResult=false must NOT sail through.
        assertThatThrownBy(() -> step().path("/v1/infected").requireTrue("CleanResult").go())
                .isInstanceOf(IOException.class)
                .hasMessageContaining("CleanResult")
                .hasMessageContaining("not true");
    }

    @Test
    void aMissingVerdictFieldFailsClosed() {
        connection(Map.of());

        // /v1/scan answers {"verdict":"clean"} - it has no CleanResult field at all. A gate that
        // cannot find its verdict must stop the run, not wave the document through.
        assertThatThrownBy(() -> step().path("/v1/scan").requireTrue("CleanResult").go())
                .isInstanceOf(IOException.class)
                .hasMessageContaining("not true");
    }

    @Test
    void sendsAVendorShapedJsonBodyWithTheDocumentNestedInside() throws IOException {
        connection(Map.of());

        // ConsignO's submit shape: the PDF base64'd into documents[0].data.
        step().path("/v1/scan")
                .bodyMode("json")
                .bodyTemplate(
                        "{\"name\":\"{{document.filename}}\",\"status\":1,"
                                + "\"documents\":[{\"name\":\"{{document.filename}}\",\"data\":\"{{document.base64}}\"}],"
                                + "\"actions\":[{\"mode\":\"remote\",\"signer\":{\"type\":\"certifio\"}}]}")
                .go();

        assertThat(receivedContentType).isEqualTo("application/json");
        JsonNode sent = objectMapper.readTree(receivedBody);
        assertThat(sent.at("/name").asString()).isEqualTo("claim.pdf");
        // Numbers keep their type; only strings are substituted.
        assertThat(sent.at("/status").isNumber()).isTrue();
        assertThat(sent.at("/actions/0/signer/type").asString()).isEqualTo("certifio");
        assertThat(Base64.getDecoder().decode(sent.at("/documents/0/data").asString()))
                .startsWith("%PDF".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void appliesTheConnectionsCredentialAndTheStepsHeadersAndVerb() throws IOException {
        connection(Map.of("authType", "BEARER", "token", "s3cr3t-token"));

        step().path("/v1/scan")
                .method("PUT")
                .headers("{\"X-Case-Id\":\"{{run.runId}}\"}")
                .run(null, "run-99")
                .go();

        assertThat(receivedMethod).isEqualTo("PUT");
        assertThat(receivedHeaders.get("X-case-id")).isEqualTo("run-99");
        // The connection's credential, which the step never supplies or sees.
        assertThat(receivedHeaders.get("Authorization")).isEqualTo("Bearer s3cr3t-token");
    }

    @Test
    void aStepCannotAimTheCallAtAnotherHost() {
        connection(Map.of());

        assertThatThrownBy(() -> step().path("//evil.example/x").go())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must be relative");
    }

    @Test
    void notifyStyleCallOutSendsTheFactsWithoutTheDocument() throws IOException {
        connection(Map.of());

        Step notify = step().path("/v1/scan").bodyMode("json").includeContext(true);
        notify.includeFile = false;
        notify.run("Outbound review", "run-7").go();

        JsonNode sent = objectMapper.readTree(receivedBody);
        assertThat(sent.at("/document/filename").asString()).isEqualTo("claim.pdf");
        assertThat(sent.at("/run/policyName").asString()).isEqualTo("Outbound review");
        // No document: the point of a notification is the facts, not the bytes.
        assertThat(sent.has("content")).isFalse();
        assertThat(receivedBody).doesNotContain("%PDF");
    }
}
