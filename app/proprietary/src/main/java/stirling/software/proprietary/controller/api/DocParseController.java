package stirling.software.proprietary.controller.api;

import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

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

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.model.tool.ToolIOCase;
import stirling.software.common.model.tool.ToolIOWhen;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.proprietary.model.api.docparse.IngestApiRequest;
import stirling.software.proprietary.model.docparse.DocChunk;
import stirling.software.proprietary.model.docparse.IngestOutcome;
import stirling.software.proprietary.service.AiToolResponseHeaders;
import stirling.software.proprietary.service.DocParseService;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Public DocParse ingestion API. Thin HTTP layer over {@link DocParseService}, which owns the
 * engine wire contract; this class owns the pipeline step shape (report header, export ZIP).
 */
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
    private final TempFileManager tempFileManager;

    @GetMapping("/capabilities")
    @Operation(summary = "Current ingestion and indexing readiness for guided policy setup")
    public DocParseService.Capabilities capabilities() {
        return docParseService.capabilities();
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/ingest",
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
                        when = {
                            @ToolIOWhen(param = "includeOriginal", matches = "false"),
                            @ToolIOWhen(param = "exportMarkdown", matches = "true"),
                            @ToolIOWhen(param = "exportChunksJsonl", matches = "true")
                        },
                        produces = ToolFormat.ANY,
                        arity = ToolArity.SIMO)
            })
    @Operation(
            summary = "Chunk, embed, and index a document into the knowledge base (pipeline shape)",
            description =
                    "Ingests the document into the engine's knowledge base under a stable documentId"
                            + " (default: content hash). Returns a ZIP containing the original PDF"
                            + " when includeOriginal is true and any selected markdown or chunks"
                            + " JSONL exports. Pipelines unpack the ZIP for the next step. The"
                            + " X-Stirling-Tool-Report header contains the ingest summary JSON.")
    public ResponseEntity<Resource> ingest(@ModelAttribute IngestApiRequest request)
            throws IOException {
        if (!request.isIncludeOriginal()
                && !request.isExportMarkdown()
                && !request.isExportChunksJsonl()) {
            throw new IllegalArgumentException(
                    "Select at least one corpus export when excluding the original PDF");
        }
        IngestOutcome outcome = docParseService.ingest(request);

        // The report header must stay small: summary fields only, never the parsed content.
        ObjectNode report = objectMapper.createObjectNode();
        report.put("documentId", outcome.documentId());
        report.put("chunksIndexed", outcome.chunksIndexed());
        report.put("pages", outcome.pages());
        report.put("sourcePages", outcome.sourcePages());
        // Without this a capped ingest is indistinguishable from a complete one.
        report.put("truncated", outcome.truncated());
        report.put("indexed", request.isIndex());
        String reportJson = objectMapper.writeValueAsString(report);

        MultipartFile file = request.getFileInput();
        String fileName = DocParseService.fileName(file);

        // Stream the archive to disk: a 2 GB upload must never be held in heap, and this endpoint
        // is not queued, so several can run at once.
        TempFile zip = tempFileManager.createManagedTempFile(".zip");
        try {
            writeZip(zip, fileName, file, outcome, request);
        } catch (IOException e) {
            zip.close();
            throw e;
        }

        // fileToWebResponse streams the temp file and deletes it once the response body is closed.
        ResponseEntity<Resource> response =
                WebResponseUtils.fileToWebResponse(
                        zip,
                        baseName(fileName) + "-ingested.zip",
                        MediaType.parseMediaType("application/zip"));
        HttpHeaders headers = new HttpHeaders();
        headers.addAll(response.getHeaders());
        headers.set(AiToolResponseHeaders.TOOL_REPORT, reportJson);
        return new ResponseEntity<>(response.getBody(), headers, response.getStatusCode());
    }

    /** Original + requested corpus files in one ZIP, so destinations receive them together. */
    private void writeZip(
            TempFile target,
            String fileName,
            MultipartFile file,
            IngestOutcome outcome,
            IngestApiRequest request)
            throws IOException {
        String base = baseName(fileName);
        try (ZipOutputStream zip =
                new ZipOutputStream(
                        new BufferedOutputStream(Files.newOutputStream(target.getPath())))) {
            if (request.isIncludeOriginal()) {
                zip.putNextEntry(new ZipEntry(fileName));
                // Copied from the upload's stream (disk-backed for large files) rather than
                // getBytes(), so the original is never materialised in heap.
                try (InputStream original = file.getInputStream()) {
                    original.transferTo(zip);
                }
                zip.closeEntry();
            }
            if (request.isExportMarkdown()) {
                zip.putNextEntry(new ZipEntry(base + ".md"));
                zip.write(
                        (outcome.markdown() == null ? "" : outcome.markdown())
                                .getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
            if (request.isExportChunksJsonl()) {
                zip.putNextEntry(new ZipEntry(base + ".chunks.jsonl"));
                zip.write(chunksJsonl(outcome).getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
    }

    /** One chunk per line, each self-describing: the documentId travels on every line. */
    private String chunksJsonl(IngestOutcome outcome) {
        if (outcome.chunks() == null) {
            return "";
        }
        StringBuilder lines = new StringBuilder();
        for (DocChunk chunk : outcome.chunks()) {
            ObjectNode line = objectMapper.createObjectNode();
            line.put("documentId", outcome.documentId());
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
