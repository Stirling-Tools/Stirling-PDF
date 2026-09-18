package stirling.software.proprietary.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.model.tool.ToolIOCase;
import stirling.software.common.model.tool.ToolIOWhen;
import stirling.software.proprietary.model.api.docparse.RagIngestApiRequest;
import stirling.software.proprietary.model.docparse.DocChunk;
import stirling.software.proprietary.model.docparse.DocparseCapabilitiesView;
import stirling.software.proprietary.model.docparse.DocparseMode;
import stirling.software.proprietary.model.docparse.IngestOutcome;
import stirling.software.proprietary.model.docparse.RagIngestResponse;
import stirling.software.proprietary.service.AiToolResponseHeaders;
import stirling.software.proprietary.service.DocParseService;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Public DocParse ingestion API. Thin HTTP layer over {@link DocParseService}, which owns the
 * engine wire contract; this class owns the pipeline step shape (report header, export ZIP).
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/docparse")
@RequiredArgsConstructor
@Tag(
        name = "DocParse",
        description =
                "Document ingestion: chunk, embed, and index documents into the searchable"
                        + " knowledge base, or export the parsed content (markdown, chunks JSONL)"
                        + " for external systems.")
public class DocParseController {

    private final DocParseService docParseService;
    private final ObjectMapper objectMapper;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/rag-ingest",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(
            produces = ToolFormat.PDF,
            arity = ToolArity.SIMO,
            cases = {
                @ToolIOCase(
                        when = {
                            @ToolIOWhen(param = "includeOriginal", matches = "false"),
                            @ToolIOWhen(param = "exportMarkdown", matches = "false")
                        },
                        produces = ToolFormat.JSON,
                        arity = ToolArity.SIMO),
                @ToolIOCase(
                        when = {
                            @ToolIOWhen(param = "includeOriginal", matches = "false"),
                            @ToolIOWhen(param = "exportChunksJsonl", matches = "false")
                        },
                        produces = ToolFormat.MARKDOWN,
                        arity = ToolArity.SIMO),
                @ToolIOCase(
                        when = @ToolIOWhen(param = "exportMarkdown", matches = "true"),
                        produces = ToolFormat.ANY,
                        arity = ToolArity.SIMO),
                @ToolIOCase(
                        when = @ToolIOWhen(param = "exportChunksJsonl", matches = "true"),
                        produces = ToolFormat.ANY,
                        arity = ToolArity.SIMO)
            })
    @Operation(
            summary = "Chunk, embed, and index a document into the RAG store (pipeline shape)",
            description =
                    "Ingests the document into the engine's RAG store under a stable documentId"
                            + " (default: content hash). Returns a ZIP containing the original PDF"
                            + " when includeOriginal is true and any selected markdown or chunks"
                            + " JSONL exports. Pipelines unpack the ZIP for the next step. The"
                            + " X-Stirling-Tool-Report header contains the ingest summary JSON."
                            + " Input:PDF Output:ZIP Type:SIMO")
    public ResponseEntity<Resource> ragIngest(@ModelAttribute RagIngestApiRequest request)
            throws IOException {
        if (!request.isIncludeOriginal()
                && !request.isExportMarkdown()
                && !request.isExportChunksJsonl()) {
            throw new IllegalArgumentException(
                    "Select at least one corpus export when excluding the original PDF");
        }
        MultipartFile file = request.getFileInput();
        IngestOutcome outcome =
                docParseService.ragIngest(
                        file,
                        request.getDocumentId(),
                        request.getChunkSize(),
                        request.getOverlap(),
                        DocparseMode.fromWire(request.getMode()),
                        request.isIndex(),
                        request.isExportMarkdown(),
                        request.isExportChunksJsonl());

        RagIngestResponse result = outcome.response();
        // The report header must stay small: summary fields only, never the echoed content.
        ObjectNode report = objectMapper.createObjectNode();
        report.put("mode", result.mode().wire());
        report.put("documentId", result.documentId());
        report.put("chunksIndexed", result.chunksIndexed());
        report.put("pages", result.pages());
        report.put("sourcePages", outcome.sourcePages());
        // Without this a capped ingest is indistinguishable from a complete one.
        report.put("truncated", outcome.truncated());
        report.put("indexed", request.isIndex());

        String fileName = DocParseService.fileName(file);
        byte[] original = request.isIncludeOriginal() ? file.getBytes() : new byte[0];
        HttpHeaders headers = new HttpHeaders();
        headers.set(AiToolResponseHeaders.TOOL_REPORT, objectMapper.writeValueAsString(report));

        byte[] zip = exportZip(fileName, original, result, request);
        headers.setContentType(MediaType.parseMediaType("application/zip"));
        headers.setContentDispositionFormData("attachment", baseName(fileName) + "-ingested.zip");
        headers.setContentLength(zip.length);
        return ResponseEntity.ok().headers(headers).body(new ByteArrayResource(zip));
    }

    @GetMapping("/capabilities")
    @Operation(
            summary = "DocParse capability summary",
            description =
                    "Merged view of the Java settings and the engine's capability probe, so"
                            + " clients can gate advanced-tier UI.")
    public ResponseEntity<DocparseCapabilitiesView> capabilities(
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "false")
                    boolean refresh) {
        return ResponseEntity.ok(docParseService.capabilitiesView(refresh));
    }

    /** Original + requested corpus files in one ZIP, so destinations receive them together. */
    private byte[] exportZip(
            String fileName, byte[] original, RagIngestResponse result, RagIngestApiRequest request)
            throws IOException {
        String base = baseName(fileName);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            if (request.isIncludeOriginal()) {
                zip.putNextEntry(new ZipEntry(fileName));
                zip.write(original);
                zip.closeEntry();
            }
            if (request.isExportMarkdown()) {
                zip.putNextEntry(new ZipEntry(base + ".md"));
                zip.write(
                        (result.markdown() == null ? "" : result.markdown())
                                .getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
            if (request.isExportChunksJsonl()) {
                zip.putNextEntry(new ZipEntry(base + ".chunks.jsonl"));
                zip.write(chunksJsonl(result).getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return out.toByteArray();
    }

    /** One chunk per line, each self-describing (documentId + source travel on every line). */
    private String chunksJsonl(RagIngestResponse result) {
        if (result.chunks() == null) {
            return "";
        }
        StringBuilder lines = new StringBuilder();
        for (DocChunk chunk : result.chunks()) {
            ObjectNode line = objectMapper.createObjectNode();
            line.put("documentId", result.documentId());
            line.put("index", chunk.index());
            line.put("text", chunk.text());
            if (chunk.pageStart() != null) {
                line.put("pageStart", chunk.pageStart());
            }
            if (chunk.pageEnd() != null) {
                line.put("pageEnd", chunk.pageEnd());
            }
            var headings = line.putArray("headingPath");
            chunk.headingPath().forEach(headings::add);
            lines.append(objectMapper.writeValueAsString(line)).append('\n');
        }
        return lines.toString();
    }

    private static String baseName(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot > 0 ? fileName.substring(0, dot) : fileName;
    }
}
