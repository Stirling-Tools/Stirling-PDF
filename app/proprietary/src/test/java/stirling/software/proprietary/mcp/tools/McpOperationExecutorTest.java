package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;

import stirling.software.common.service.InternalApiClient;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;
import stirling.software.proprietary.mcp.files.McpFileUrlFetcher;
import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.security.model.User;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class McpOperationExecutorTest {

    private static final String LINK = "https://api.example.com/api/v1/storage/share-links/t";

    private final ObjectMapper mapper = new ObjectMapper();
    private final McpCallContext context = new McpCallContext("alice", Set.of(), false);
    private final User alice = new User();
    private final InternalApiClient api = mock(InternalApiClient.class);
    private final McpFiles files = mock(McpFiles.class);
    private final McpFileUrlFetcher fetcher = mock(McpFileUrlFetcher.class);
    private final McpOperationExecutor executor =
            new McpOperationExecutor(mapper, api, files, fetcher, null, null);

    @BeforeEach
    void setUp() throws Exception {
        when(files.user(context)).thenReturn(alice);
        stubSave(alice, saved(LINK, null));
        when(api.post(anyString(), any()))
                .thenReturn(pdfResponse("OUT".getBytes(StandardCharsets.UTF_8)));
    }

    private static McpFiles.Saved saved(String link, byte[] inline) {
        return new McpFiles.Saved("7", "out.pdf", "application/pdf", 3, link, null, true, inline);
    }

    private void stubSave(User user, McpFiles.Saved saved) throws Exception {
        when(files.save(
                        eq(user),
                        any(Resource.class),
                        anyString(),
                        anyString(),
                        anyLong(),
                        eq(true)))
                .thenReturn(saved);
    }

    private OperationMeta compressOp() {
        return new OperationMeta(
                "compress-pdf",
                OperationCategory.MISC,
                "Compress",
                mapper.createObjectNode(),
                "mcp.tools.write",
                OperationMeta.Target.JAVA_ENDPOINT,
                "/api/v1/misc/compress-pdf",
                null);
    }

    private ResponseEntity<Resource> pdfResponse(byte[] bytes) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        Resource body =
                new ByteArrayResource(bytes) {
                    @Override
                    public String getFilename() {
                        return "out.pdf";
                    }
                };
        return ResponseEntity.ok().headers(headers).body(body);
    }

    private ObjectNode base64Args() {
        ObjectNode args = mapper.createObjectNode();
        args.put("file", Base64.getEncoder().encodeToString("IN".getBytes(StandardCharsets.UTF_8)));
        return args;
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void base64Input_storesResultAndReturnsFileCardWithLink() {
        ObjectNode args = base64Args();
        args.putObject("parameters").put("optimizeLevel", 2);

        ObjectNode result = executor.execute(compressOp(), args, context);

        assertFalse(result.path("isError").asBoolean(false));
        ArgumentCaptor<MultiValueMap> bodyCap = ArgumentCaptor.forClass(MultiValueMap.class);
        verify(api).post(eq("/api/v1/misc/compress-pdf"), bodyCap.capture());
        assertTrue(bodyCap.getValue().containsKey("fileInput"), "must send fileInput");
        assertEquals("2", String.valueOf(bodyCap.getValue().getFirst("optimizeLevel")));

        assertEquals(1, result.get("content").size(), "no inline blob");
        String text = result.get("content").get(0).get("text").asText();
        assertTrue(text.contains(LINK));
        assertTrue(text.contains("signs in"), "private link tells the model a sign-in is needed");
        ObjectNode card = (ObjectNode) result.get("structuredContent");
        assertEquals("file", card.get("kind").asText());
        assertEquals("7", card.get("fileId").asText());
        assertEquals("out.pdf", card.get("fileName").asText());
        assertEquals(LINK, card.get("downloadUrl").asText());
    }

    @Test
    void linksOff_resultStillHasFileIdButNoLink() throws Exception {
        stubSave(alice, saved(null, null));

        ObjectNode result = executor.execute(compressOp(), base64Args(), context);

        assertFalse(result.path("isError").asBoolean(false));
        assertEquals("7", result.get("structuredContent").get("fileId").asText());
        assertNull(result.get("structuredContent").get("downloadUrl"));
    }

    @Test
    void appsClient_getsShortTextWithoutTheLink() throws Exception {
        McpCallContext appsClient =
                new McpCallContext(
                        "alice",
                        Set.of(),
                        false,
                        mapper.readTree("{\"extensions\":{\"io.modelcontextprotocol/ui\":{}}}"),
                        null);
        when(files.user(appsClient)).thenReturn(alice);

        ObjectNode result = executor.execute(compressOp(), base64Args(), appsClient);

        String text = result.get("content").get(0).get("text").asText();
        assertFalse(text.contains(LINK), "the card carries the link");
        assertTrue(text.contains("do not repeat"));
        assertEquals(LINK, result.get("structuredContent").get("downloadUrl").asText());
    }

    @Test
    void upstreamClientError_explainsWhyAndHowToRetry() throws Exception {
        ObjectNode schema = mapper.createObjectNode();
        schema.putObject("properties").putObject("optimizeLevel").put("type", "integer");
        OperationMeta op =
                new OperationMeta(
                        "compress-pdf",
                        OperationCategory.MISC,
                        "Compress",
                        schema,
                        "mcp.tools.write",
                        OperationMeta.Target.JAVA_ENDPOINT,
                        "/api/v1/misc/compress-pdf",
                        null);
        when(api.post(anyString(), any()))
                .thenThrow(
                        HttpClientErrorException.create(
                                HttpStatus.BAD_REQUEST,
                                "Bad Request",
                                new HttpHeaders(),
                                "{\"detail\":\"optimizeLevel must be\\n 1-9\"}"
                                        .getBytes(StandardCharsets.UTF_8),
                                StandardCharsets.UTF_8));

        String text =
                executor.execute(op, base64Args(), context)
                        .get("content")
                        .get(0)
                        .get("text")
                        .asText();

        assertTrue(text.contains("HTTP 400"));
        assertTrue(text.contains("optimizeLevel must be 1-9"));
        assertTrue(text.contains("(optimizeLevel?:integer)"));
        assertTrue(text.contains("retry with Stirling PDF"));
    }

    @Test
    void upstreamServerError_neverEchoesHtml() throws Exception {
        when(api.post(anyString(), any()))
                .thenThrow(
                        HttpServerErrorException.create(
                                HttpStatus.INTERNAL_SERVER_ERROR,
                                "Oops",
                                new HttpHeaders(),
                                "<html>stack trace</html>".getBytes(StandardCharsets.UTF_8),
                                StandardCharsets.UTF_8));

        String text =
                executor.execute(compressOp(), base64Args(), context)
                        .get("content")
                        .get(0)
                        .get("text")
                        .asText();

        assertFalse(text.contains("stack trace"));
        assertTrue(text.contains("tell the user"));
    }

    private OperationMeta mergeOp() {
        ObjectNode schema = mapper.createObjectNode();
        schema.putObject("properties")
                .putObject("fileInput")
                .put("type", "array")
                .putObject("items")
                .put("type", "string")
                .put("format", "file-id");
        return new OperationMeta(
                "merge-pdfs",
                OperationCategory.PAGES,
                "Merge",
                schema,
                "mcp.tools.write",
                OperationMeta.Target.JAVA_ENDPOINT,
                "/api/v1/general/merge-pdfs",
                null);
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void fileIdsList_sendsEveryFileInOrderToMultiFileOperations() throws Exception {
        when(files.load(alice, "1")).thenReturn(new McpFiles.Loaded("A".getBytes(), "a.pdf"));
        when(files.load(alice, "2")).thenReturn(new McpFiles.Loaded("B".getBytes(), "b.pdf"));
        ObjectNode args = mapper.createObjectNode();
        args.putArray("fileIds").add("1").add("2");

        ObjectNode result = executor.execute(mergeOp(), args, context);

        assertFalse(result.path("isError").asBoolean(false));
        ArgumentCaptor<MultiValueMap> bodyCap = ArgumentCaptor.forClass(MultiValueMap.class);
        verify(api).post(eq("/api/v1/general/merge-pdfs"), bodyCap.capture());
        assertEquals(2, ((List<?>) bodyCap.getValue().get("fileInput")).size());
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void fileIdsGoToTheOnlyFileList_whenThereIsNoMainInput() throws Exception {
        when(files.load(alice, "1")).thenReturn(new McpFiles.Loaded("A".getBytes(), "a.pdf"));
        when(files.load(alice, "2")).thenReturn(new McpFiles.Loaded("B".getBytes(), "b.pdf"));
        ObjectNode schema = mapper.createObjectNode();
        schema.putObject("properties")
                .putObject("files")
                .put("type", "array")
                .putObject("items")
                .put("type", "string")
                .put("format", "file-id");
        schema.putArray("required").add("files");
        OperationMeta portfolio =
                new OperationMeta(
                        "create-portfolio",
                        OperationCategory.MISC,
                        "Portfolio",
                        schema,
                        "mcp.tools.write",
                        OperationMeta.Target.JAVA_ENDPOINT,
                        "/api/v1/misc/create-portfolio",
                        null);
        ObjectNode args = mapper.createObjectNode();
        args.putArray("fileIds").add("1").add("2");

        ObjectNode result = executor.execute(portfolio, args, context);

        assertFalse(result.path("isError").asBoolean(false), result.toString());
        ArgumentCaptor<MultiValueMap> bodyCap = ArgumentCaptor.forClass(MultiValueMap.class);
        verify(api).post(eq("/api/v1/misc/create-portfolio"), bodyCap.capture());
        assertEquals(2, ((List<?>) bodyCap.getValue().get("files")).size());
        assertNull(bodyCap.getValue().get("fileInput"));
    }

    @Test
    void aSecondFileIsPointedAtTheOperationsFileParameter() throws Exception {
        when(files.load(alice, "1")).thenReturn(new McpFiles.Loaded("A".getBytes(), "a.pdf"));
        when(files.load(alice, "2")).thenReturn(new McpFiles.Loaded("L".getBytes(), "logo.png"));
        ObjectNode schema = mapper.createObjectNode();
        ObjectNode properties = schema.putObject("properties");
        properties.putObject("fileInput").put("type", "string").put("format", "file-id");
        properties.putObject("imageFile").put("type", "string").put("format", "file-id");
        OperationMeta addImage =
                new OperationMeta(
                        "add-image",
                        OperationCategory.MISC,
                        "Add image",
                        schema,
                        "mcp.tools.write",
                        OperationMeta.Target.JAVA_ENDPOINT,
                        "/api/v1/misc/add-image",
                        null);
        ObjectNode args = mapper.createObjectNode();
        args.putArray("fileIds").add("1").add("2");

        ObjectNode result = executor.execute(addImage, args, context);

        String text = result.get("content").get(0).get("text").asText();
        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(text.contains("parameters.imageFile"), text);
        assertFalse(text.contains("merge-pdfs"), text);
        verify(api, never()).post(anyString(), any());
    }

    @Test
    void severalFiles_toASingleFileOperation_isRefused() throws Exception {
        when(files.load(alice, "1")).thenReturn(new McpFiles.Loaded("A".getBytes(), "a.pdf"));
        when(files.load(alice, "2")).thenReturn(new McpFiles.Loaded("B".getBytes(), "b.pdf"));
        ObjectNode args = mapper.createObjectNode();
        args.putArray("fileIds").add("1").add("2");

        ObjectNode result = executor.execute(compressOp(), args, context);

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(
                result.get("content").get(0).get("text").asText().contains("takes one document"));
        verify(api, never()).post(anyString(), any());
    }

    @Test
    void missingFile_returnsError() {
        ObjectNode result = executor.execute(compressOp(), mapper.createObjectNode(), context);

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(result.get("content").get(0).get("text").asText().contains("input file"));
    }

    @Test
    void fileIdInput_loadsStoredFile() throws Exception {
        when(files.load(alice, "7")).thenReturn(new McpFiles.Loaded("IN".getBytes(), "a.pdf"));
        ObjectNode args = mapper.createObjectNode();
        args.put("fileId", "7");

        ObjectNode result = executor.execute(compressOp(), args, context);

        assertFalse(result.path("isError").asBoolean(false));
        verify(files).load(alice, "7");
    }

    @Test
    void unknownFileId_isReportedToTheModel() throws Exception {
        when(files.load(alice, "99"))
                .thenThrow(new McpFiles.McpFileException("Unknown or expired fileId '99'."));
        ObjectNode args = mapper.createObjectNode();
        args.put("fileId", "99");

        ObjectNode result = executor.execute(compressOp(), args, context);

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(result.get("content").get(0).get("text").asText().contains("expired"));
    }

    @Test
    void inlineResult_addsBase64ResourceBlock() throws Exception {
        when(files.user(context)).thenReturn(null);
        stubSave(null, saved(null, "OUT".getBytes(StandardCharsets.UTF_8)));

        ObjectNode result = executor.execute(compressOp(), base64Args(), context);

        assertFalse(result.path("isError").asBoolean(false));
        assertEquals(2, result.get("content").size());
        ObjectNode resource = (ObjectNode) result.get("content").get(1).get("resource");
        assertEquals("stirling://file/7", resource.get("uri").asText());
        assertEquals("OUT", new String(Base64.getDecoder().decode(resource.get("blob").asText())));
        assertEquals("7", result.get("structuredContent").get("fileId").asText());
    }

    @Test
    void passwordPrompt_returnsBeforeAnyFetchOrDispatch() throws Exception {
        ObjectNode schema = mapper.createObjectNode();
        schema.putObject("properties")
                .putObject("password")
                .put("type", "string")
                .put("format", "password");
        OperationMeta removePassword =
                new OperationMeta(
                        "remove-password",
                        OperationCategory.SECURITY,
                        "Remove password",
                        schema,
                        "mcp.tools.write",
                        OperationMeta.Target.JAVA_ENDPOINT,
                        "/api/v1/security/remove-password",
                        null);
        McpCallContext formClient =
                new McpCallContext(
                        "alice", Set.of(), false, mapper.readTree("{\"elicitation\":{}}"), null);
        ObjectNode args = mapper.createObjectNode();
        args.putObject("inputFile").put("download_url", "https://files.oaiusercontent.com/a");

        ObjectNode result = executor.execute(removePassword, args, formClient);

        assertEquals("input_required", result.get("resultType").asText());
        verify(fetcher, never()).fetch(anyString());
        verify(api, never()).post(anyString(), any());
    }

    @Test
    void attachmentInput_isFetchedFromDownloadUrl() throws Exception {
        when(fetcher.fetch("https://files.oaiusercontent.com/a"))
                .thenReturn("IN".getBytes(StandardCharsets.UTF_8));
        ObjectNode args = mapper.createObjectNode();
        ObjectNode att = args.putObject("inputFile");
        att.put("download_url", "https://files.oaiusercontent.com/a");
        att.put("file_id", "file-1");
        att.put("file_name", "scan.pdf");

        ObjectNode result = executor.execute(compressOp(), args, context);

        assertFalse(result.path("isError").asBoolean(false));
        verify(fetcher).fetch("https://files.oaiusercontent.com/a");
    }

    @Test
    void attachmentFetchFailure_isReportedToTheModel() throws Exception {
        when(fetcher.fetch(anyString()))
                .thenThrow(
                        new McpFileUrlFetcher.FetchException(
                                "Attachments from 'evil' are not accepted by this server."));
        ObjectNode args = mapper.createObjectNode();
        args.putObject("inputFile").put("download_url", "https://evil/x");

        ObjectNode result = executor.execute(compressOp(), args, context);

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(result.get("content").get(0).get("text").asText().contains("not accepted"));
    }

    private OperationMeta complianceOp() {
        return new OperationMeta(
                "validate-compliance",
                OperationCategory.SECURITY,
                "Check PDF/A",
                mapper.createObjectNode(),
                "mcp.tools.write",
                OperationMeta.Target.JAVA_ENDPOINT,
                "/api/v1/security/validate-compliance",
                null);
    }

    private void stubNotCompliant() {
        when(api.post(eq("/api/v1/security/validate-compliance"), any()))
                .thenThrow(
                        HttpClientErrorException.create(
                                HttpStatus.UNPROCESSABLE_ENTITY,
                                "Unprocessable",
                                new HttpHeaders(),
                                "{\"errorCode\":\"E074\",\"detail\":\"No PDF/A identification; the run was stopped.\"}"
                                        .getBytes(StandardCharsets.UTF_8),
                                StandardCharsets.UTF_8));
    }

    @Test
    void notCompliant_isAFindingForALoneCheck() {
        stubNotCompliant();

        ObjectNode result = executor.execute(complianceOp(), base64Args(), context);

        assertFalse(result.path("isError").asBoolean(false));
        assertEquals("report", result.at("/structuredContent/kind").asText());
        assertFalse(result.at("/structuredContent/report/compliant").asBoolean(true));
        assertTrue(result.at("/content/0/text").asText().startsWith("Not compliant."));
    }

    @Test
    void notCompliant_stillStopsAPipeline() {
        stubNotCompliant();
        List<McpPipelineStep> steps =
                List.of(new McpPipelineStep(complianceOp(), mapper.createObjectNode()));

        ObjectNode result = executor.executePipeline(steps, base64Args(), context);

        assertTrue(result.path("isError").asBoolean(false));
    }

    @Test
    void compliant_saysSoAndKeepsTheFile() {
        ObjectNode result = executor.execute(complianceOp(), base64Args(), context);

        assertTrue(result.at("/structuredContent/report/compliant").asBoolean(false));
        assertEquals("7", result.at("/structuredContent/fileId").asText());
        assertTrue(result.at("/content/0/text").asText().startsWith("Compliant"));
    }

    static class BookmarkEndpoint {
        @SuppressWarnings("unused")
        public void extract(
                @org.springframework.web.bind.annotation.RequestParam("file")
                        org.springframework.web.multipart.MultipartFile file) {}
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void endpointsNamingTheirUploadDifferentlyGetItUnderThatName() throws Exception {
        OperationMeta op =
                new OperationMeta(
                        "extract-bookmarks",
                        OperationCategory.PAGES,
                        "Extract bookmarks",
                        mapper.createObjectNode(),
                        "mcp.tools.write",
                        OperationMeta.Target.JAVA_ENDPOINT,
                        "/api/v1/general/extract-bookmarks",
                        new org.springframework.web.method.HandlerMethod(
                                new BookmarkEndpoint(),
                                BookmarkEndpoint.class.getMethod(
                                        "extract",
                                        org.springframework.web.multipart.MultipartFile.class)));

        executor.execute(op, base64Args(), context);

        ArgumentCaptor<MultiValueMap> body = ArgumentCaptor.forClass(MultiValueMap.class);
        verify(api).post(eq("/api/v1/general/extract-bookmarks"), body.capture());
        assertTrue(body.getValue().containsKey("file"));
        assertFalse(body.getValue().containsKey("fileInput"));
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void fileIdsForFileParametersAreSentAsFiles() throws Exception {
        ObjectNode schema = mapper.createObjectNode();
        ObjectNode properties = schema.putObject("properties");
        properties.putObject("fileInput").put("type", "string").put("format", "file-id");
        ObjectNode overlay = properties.putObject("overlayFiles");
        overlay.put("type", "array");
        overlay.putObject("items").put("type", "string").put("format", "file-id");
        OperationMeta op =
                new OperationMeta(
                        "overlay-pdfs",
                        OperationCategory.PAGES,
                        "Overlay",
                        schema,
                        "mcp.tools.write",
                        OperationMeta.Target.JAVA_ENDPOINT,
                        "/api/v1/general/overlay-pdfs",
                        null);
        when(files.load(alice, "8"))
                .thenReturn(new McpFiles.Loaded("OVER".getBytes(StandardCharsets.UTF_8), "o.pdf"));
        ObjectNode args = base64Args();
        args.putObject("parameters").putArray("overlayFiles").add("8");

        ObjectNode result = executor.execute(op, args, context);

        assertFalse(result.path("isError").asBoolean(false), result.toString());
        ArgumentCaptor<MultiValueMap> body = ArgumentCaptor.forClass(MultiValueMap.class);
        verify(api).post(eq("/api/v1/general/overlay-pdfs"), body.capture());
        Object sent = body.getValue().getFirst("overlayFiles");
        assertTrue(sent instanceof Resource, "a file, not the id string");
        assertEquals("o.pdf", ((Resource) sent).getFilename());
    }

    @Test
    void unknownFileIdForAFileParameterIsAClearError() throws Exception {
        ObjectNode schema = mapper.createObjectNode();
        schema.putObject("properties")
                .putObject("attachments")
                .put("type", "array")
                .putObject("items")
                .put("format", "file-id");
        OperationMeta op =
                new OperationMeta(
                        "add-attachments",
                        OperationCategory.MISC,
                        "Attach",
                        schema,
                        "mcp.tools.write",
                        OperationMeta.Target.JAVA_ENDPOINT,
                        "/api/v1/misc/add-attachments",
                        null);
        when(files.load(alice, "404"))
                .thenThrow(new McpFiles.McpFileException("Unknown or expired fileId '404'."));
        ObjectNode args = base64Args();
        args.putObject("parameters").putArray("attachments").add("404");

        ObjectNode result = executor.execute(op, args, context);

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(result.at("/content/0/text").asText().contains("attachments"));
        verify(api, never()).post(eq("/api/v1/misc/add-attachments"), any());
    }

    @Test
    void genericMimeTypesAreReplacedFromTheExtension() throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        Resource docx =
                new ByteArrayResource("DOCX".getBytes(StandardCharsets.UTF_8)) {
                    @Override
                    public String getFilename() {
                        return "out.docx";
                    }
                };
        when(api.post(anyString(), any()))
                .thenReturn(ResponseEntity.ok().headers(headers).body(docx));

        executor.execute(compressOp(), base64Args(), context);

        verify(files)
                .save(
                        eq(alice),
                        any(Resource.class),
                        eq("out.docx"),
                        eq(
                                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                        anyLong(),
                        eq(true));
        assertEquals(
                "document",
                McpZipParts.outputKind(
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        "out.docx"));
    }

    @Test
    void outputsManyTimesTheirInputCarryAWarning() throws Exception {
        stubSave(
                alice,
                new McpFiles.Saved(
                        "7", "big.pdf", "application/pdf", 900_000, null, null, false, null));

        ObjectNode result = executor.execute(compressOp(), base64Args(), context);

        assertTrue(result.at("/structuredContent/warnings/0").asText().contains("x the input"));
        assertTrue(result.at("/content/0/text").asText().contains("Warning:"));
    }

    @Test
    void noTablesFound_isAClearOutcomeNotAStorageError() throws Exception {
        when(api.post(anyString(), any())).thenReturn(ResponseEntity.noContent().build());
        OperationMeta xlsx =
                new OperationMeta(
                        "pdf-to-xlsx",
                        OperationCategory.CONVERT,
                        "To Excel",
                        mapper.createObjectNode(),
                        "mcp.tools.write",
                        OperationMeta.Target.JAVA_ENDPOINT,
                        "/api/v1/convert/pdf/xlsx",
                        null);

        ObjectNode result = executor.execute(xlsx, base64Args(), context);

        assertFalse(result.path("isError").asBoolean(false));
        assertEquals("none", result.at("/structuredContent/outputKind").asText());
        assertTrue(result.at("/content/0/text").asText().contains("no tables"));
        verify(files, never())
                .save(any(), any(Resource.class), anyString(), anyString(), anyLong(), eq(true));
    }

    @Test
    void emptyReportsSayNothingWasFound() {
        ObjectNode result = McpResponses.report(mapper, "validate-signature", "[]");

        assertEquals(0, result.at("/structuredContent/count").asInt(-1));
        assertTrue(result.at("/content/0/text").asText().contains("found nothing"));
    }

    @Test
    void errorsCarryAMachineReadableEnvelope() {
        when(api.post(anyString(), any()))
                .thenThrow(
                        HttpClientErrorException.create(
                                HttpStatus.BAD_REQUEST,
                                "Bad Request",
                                new HttpHeaders(),
                                new byte[0],
                                StandardCharsets.UTF_8));
        ObjectNode bad = executor.execute(compressOp(), base64Args(), context);
        assertEquals("invalid_parameters", bad.at("/structuredContent/error/code").asText());
        assertEquals("operation", bad.at("/structuredContent/error/stage").asText());
        assertTrue(bad.at("/structuredContent/error/retryable").asBoolean());
        assertEquals(400, bad.at("/structuredContent/error/httpStatus").asInt());

        org.mockito.Mockito.doThrow(
                        HttpServerErrorException.create(
                                HttpStatus.INTERNAL_SERVER_ERROR,
                                "Boom",
                                new HttpHeaders(),
                                new byte[0],
                                StandardCharsets.UTF_8))
                .when(api)
                .post(anyString(), any());
        ObjectNode broken = executor.execute(compressOp(), base64Args(), context);
        assertEquals("operation_failed", broken.at("/structuredContent/error/code").asText());
        assertFalse(broken.at("/structuredContent/error/retryable").asBoolean(true));
        String ref = broken.at("/structuredContent/error/ref").asText();
        assertEquals(8, ref.length());
        assertTrue(broken.at("/content/0/text").asText().contains("ref " + ref));
    }

    @Test
    void missingInputIsAnInputStageError() {
        ObjectNode result = executor.execute(compressOp(), mapper.createObjectNode(), context);

        assertEquals("input", result.at("/structuredContent/error/stage").asText());
        assertEquals("input_unavailable", result.at("/structuredContent/error/code").asText());
    }

    @Test
    void redactionThatMatchedNothingIsFlagged() throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.set("X-Stirling-Redaction-Matches", "0");
        when(api.post(anyString(), any()))
                .thenReturn(
                        ResponseEntity.ok()
                                .headers(headers)
                                .body(
                                        new ByteArrayResource(
                                                "%PDF".getBytes(StandardCharsets.UTF_8))));

        ObjectNode result = executor.execute(compressOp(), base64Args(), context);

        assertEquals(0, result.at("/structuredContent/redaction/matches").asInt(-1));
        assertTrue(result.at("/content/0/text").asText().startsWith("Warning: Nothing matched"));
    }

    @Test
    void parametersOutsideTheSchemaAreRejectedBeforeRunning() {
        ObjectNode schema = mapper.createObjectNode();
        schema.putObject("properties")
                .putObject("optimizeLevel")
                .put("type", "integer")
                .putArray("enum")
                .add("1")
                .add("9");
        OperationMeta op =
                new OperationMeta(
                        "compress-pdf",
                        OperationCategory.MISC,
                        "Compress",
                        schema,
                        "mcp.tools.write",
                        OperationMeta.Target.JAVA_ENDPOINT,
                        "/api/v1/misc/compress-pdf",
                        null);
        ObjectNode args = base64Args();
        args.putObject("parameters").put("optimizeLevel", 999);

        ObjectNode result = executor.execute(op, args, context);

        assertEquals("invalid_parameters", result.at("/structuredContent/error/code").asText());
        assertTrue(result.at("/content/0/text").asText().contains("was not run"));
        verify(api, never()).post(anyString(), any());
    }
}
