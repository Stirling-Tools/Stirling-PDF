package stirling.software.proprietary.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.proprietary.model.api.docparse.ChunkDocumentApiRequest;
import stirling.software.proprietary.model.api.docparse.ExtractFieldsApiRequest;
import stirling.software.proprietary.model.api.docparse.ExtractTablesApiRequest;
import stirling.software.proprietary.model.api.docparse.ParseDocumentApiRequest;
import stirling.software.proprietary.model.api.docparse.RagIngestApiRequest;
import stirling.software.proprietary.model.api.docparse.SmartSplitApiRequest;
import stirling.software.proprietary.model.api.docparse.SuggestSchemaApiRequest;
import stirling.software.proprietary.model.docparse.ChunkDocumentResponse;
import stirling.software.proprietary.model.docparse.DocChunk;
import stirling.software.proprietary.model.docparse.DocTable;
import stirling.software.proprietary.model.docparse.DocparseCapabilitiesView;
import stirling.software.proprietary.model.docparse.DocparseMode;
import stirling.software.proprietary.model.docparse.ExtractFieldsResponse;
import stirling.software.proprietary.model.docparse.ExtractTablesResponse;
import stirling.software.proprietary.model.docparse.FillDocxResponse;
import stirling.software.proprietary.model.docparse.ParseDocumentResponse;
import stirling.software.proprietary.model.docparse.RagIngestResponse;
import stirling.software.proprietary.model.docparse.SmartSplitResponse;
import stirling.software.proprietary.model.docparse.SplitPart;
import stirling.software.proprietary.model.docparse.SuggestSchemaResponse;
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

    private static final MediaType CSV = MediaType.parseMediaType("text/csv");

    private static final MediaType MARKDOWN = MediaType.parseMediaType("text/markdown");
    private static final MediaType DOCX =
            MediaType.parseMediaType(
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    private final DocParseService docParseService;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final ObjectMapper objectMapper;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/rag-ingest",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @Operation(
            summary = "Chunk, embed, and index a document into the RAG store (pipeline shape)",
            description =
                    "Ingests the document into the engine's RAG store under a stable documentId"
                            + " (default: content hash). Returns the ORIGINAL PDF unchanged as the"
                            + " body, with the ingest summary JSON in the X-Stirling-Tool-Report"
                            + " header so policy pipelines pick it up as the step report. With"
                            + " exportMarkdown/exportChunksJsonl the body becomes a ZIP holding the"
                            + " original plus the corpus files, ready for delivery to external"
                            + " systems. Input:PDF Output:PDF/ZIP Type:SISO")
    public ResponseEntity<Resource> ragIngest(@ModelAttribute RagIngestApiRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        boolean export = request.isExportMarkdown() || request.isExportChunksJsonl();
        RagIngestResponse result =
                docParseService.ragIngest(
                        file,
                        request.getDocumentId(),
                        request.getChunkSize(),
                        request.getOverlap(),
                        DocparseMode.fromWire(request.getMode()),
                        request.isIndex(),
                        request.isExportMarkdown(),
                        request.isExportChunksJsonl());

        // The report header must stay small: summary fields only, never the echoed content.
        ObjectNode report = objectMapper.createObjectNode();
        report.put("mode", result.mode().wire());
        report.put("documentId", result.documentId());
        report.put("chunksIndexed", result.chunksIndexed());
        report.put("pages", result.pages());
        report.put("indexed", request.isIndex());

        String fileName = DocParseService.fileName(file);
        byte[] original = file.getBytes();
        HttpHeaders headers = new HttpHeaders();
        headers.set(AiToolResponseHeaders.TOOL_REPORT, objectMapper.writeValueAsString(report));

        if (!export) {
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDispositionFormData("attachment", fileName);
            headers.setContentLength(original.length);
            return ResponseEntity.ok().headers(headers).body(new ByteArrayResource(original));
        }

        byte[] zip = exportZip(fileName, original, result, request);
        headers.setContentType(MediaType.parseMediaType("application/zip"));
        headers.setContentDispositionFormData("attachment", baseName(fileName) + "-ingested.zip");
        headers.setContentLength(zip.length);
        return ResponseEntity.ok().headers(headers).body(new ByteArrayResource(zip));
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/extract-fields",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @Operation(
            summary = "Extract typed fields from a document (pipeline shape)",
            description =
                    "Extracts the fields described by the JSON Schema and returns the ORIGINAL PDF"
                            + " unchanged as the body, with the extraction JSON in the"
                            + " X-Stirling-Tool-Report header so policy pipelines pick it up as the"
                            + " step report. Use /extract-fields/json for the raw JSON."
                            + " Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<Resource> extractFields(@ModelAttribute ExtractFieldsApiRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        ExtractFieldsResponse result =
                docParseService.extractFields(
                        file,
                        request.getFieldsSchema(),
                        DocparseMode.fromWire(request.getMode()),
                        request.getInstructions());
        byte[] original = file.getBytes();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("attachment", DocParseService.fileName(file));
        headers.setContentLength(original.length);
        headers.set(AiToolResponseHeaders.TOOL_REPORT, objectMapper.writeValueAsString(result));
        return ResponseEntity.ok().headers(headers).body(new ByteArrayResource(original));
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/extract-fields/json",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @Operation(
            summary = "Extract typed fields from a document (JSON)",
            description =
                    "Extracts the fields described by the JSON Schema and returns the extraction"
                            + " result (fields, confidence, citations) as JSON."
                            + " Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<ExtractFieldsResponse> extractFieldsJson(
            @ModelAttribute ExtractFieldsApiRequest request) throws IOException {
        return ResponseEntity.ok(
                docParseService.extractFields(
                        request.getFileInput(),
                        request.getFieldsSchema(),
                        DocparseMode.fromWire(request.getMode()),
                        request.getInstructions()));
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/suggest-schema",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @Operation(
            summary = "Suggest an extraction schema for a document",
            description =
                    "Reads the document and proposes the fields worth extracting (name, type,"
                            + " description), ready to feed into /extract-fields as a JSON Schema."
                            + " Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<SuggestSchemaResponse> suggestSchema(
            @ModelAttribute SuggestSchemaApiRequest request) throws IOException {
        return ResponseEntity.ok(
                docParseService.suggestSchema(request.getFileInput(), request.getMaxFields()));
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/parse-document",
            resourceWeight = ResourceWeight.XLARGE_WEIGHT)
    @Operation(
            summary = "Parse a document into structured blocks, tables, and markdown",
            description =
                    "Parses the PDF into layout blocks, tables, and a markdown rendering. The"
                            + " basic tier reads the text layer; the advanced tier (docparse addon)"
                            + " adds OCR, real table structure, and bounding boxes."
                            + " Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<?> parseDocument(@ModelAttribute ParseDocumentApiRequest request)
            throws IOException {
        ParseDocumentResponse result =
                docParseService.parse(
                        request.getFileInput(),
                        DocparseMode.fromWire(request.getMode()),
                        request.isWithOcr());
        if ("markdown".equalsIgnoreCase(request.getOutputFormat())) {
            return WebResponseUtils.bytesToWebResponse(
                    result.markdown().getBytes(StandardCharsets.UTF_8),
                    outputName(request.getFileInput(), "_parsed.md"),
                    MARKDOWN);
        }
        return ResponseEntity.ok(result);
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/smart-split",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @Operation(
            summary = "Split a document at content-derived boundaries",
            description =
                    "Asks the engine where sub-documents start (per the natural-language rule) and"
                            + " returns a ZIP with one PDF per part, named from the part labels."
                            + " Input:PDF Output:ZIP-PDF Type:SIMO")
    public ResponseEntity<Resource> smartSplit(@ModelAttribute SmartSplitApiRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        SmartSplitResponse split =
                docParseService.split(file, request.getRule(), request.getMaxParts());
        if (split.parts().isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "The split rule produced no parts for this document");
        }
        TempFile zipTempFile = tempFileManager.createManagedTempFile(".zip");
        try {
            try (TempFile sourceTempFile = new TempFile(tempFileManager, ".pdf")) {
                Files.copy(
                        file.getInputStream(),
                        sourceTempFile.getPath(),
                        StandardCopyOption.REPLACE_EXISTING);
                try (ZipOutputStream zipOut =
                        new ZipOutputStream(Files.newOutputStream(zipTempFile.getPath()))) {
                    writeParts(sourceTempFile, split.parts(), zipOut);
                }
            }
            return WebResponseUtils.zipFileToWebResponse(
                    zipTempFile,
                    GeneralUtils.generateFilename(file.getOriginalFilename(), "_split.zip"));
        } catch (Exception e) {
            zipTempFile.close();
            throw e;
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/chunk-document",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @Operation(
            summary = "Chunk a document for RAG",
            description =
                    "Splits the document text into overlapping chunks with page spans and (advanced"
                            + " tier) heading breadcrumbs. Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<ChunkDocumentResponse> chunkDocument(
            @ModelAttribute ChunkDocumentApiRequest request) throws IOException {
        return ResponseEntity.ok(
                docParseService.chunk(
                        request.getFileInput(),
                        request.getChunkSize(),
                        request.getOverlap(),
                        DocparseMode.fromWire(request.getMode())));
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/fill-template",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @Operation(
            summary = "Fill a DOCX template with JSON data",
            description =
                    "Replaces the template's placeholders with values from the JSON object and"
                            + " returns the filled DOCX. Replacement counts and missing keys ride"
                            + " the X-Stirling-Tool-Report header."
                            + " Input:DOCX Output:DOCX Type:SISO")
    public ResponseEntity<Resource> fillTemplate(
            @RequestParam("templateFile") MultipartFile templateFile,
            @RequestParam("data") String data)
            throws IOException {
        FillDocxResponse result = docParseService.fillDocx(templateFile, data);
        byte[] filled = Base64.getDecoder().decode(result.docxBase64());
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(DOCX);
        headers.setContentDispositionFormData(
                "attachment",
                GeneralUtils.generateFilename(templateFile.getOriginalFilename(), "_filled.docx"));
        headers.setContentLength(filled.length);
        headers.set(
                AiToolResponseHeaders.TOOL_REPORT,
                objectMapper.writeValueAsString(
                        new FillDocxResponse("", result.replaced(), result.missing())));
        return ResponseEntity.ok().headers(headers).body(new ByteArrayResource(filled));
    }

    @GetMapping("/capabilities")
    @Operation(
            summary = "DocParse capability summary",
            description =
                    "Merged view of the Java settings and the engine's capability probe, so"
                            + " clients can gate advanced-tier UI.")
    public ResponseEntity<DocparseCapabilitiesView> capabilities() {
        return ResponseEntity.ok(docParseService.capabilitiesView());
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/extract-tables",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @Operation(
            summary = "Extract tables from a document",
            description =
                    "Extracts table structure and returns CSV (all tables concatenated, blank line"
                            + " between them) or the structured JSON table list."
                            + " Input:PDF Output:CSV/JSON Type:SISO")
    public ResponseEntity<?> extractTables(@ModelAttribute ExtractTablesApiRequest request)
            throws IOException {
        ExtractTablesResponse result = docParseService.tables(request.getFileInput());
        if ("json".equalsIgnoreCase(request.getOutputFormat())) {
            return ResponseEntity.ok(result);
        }
        return WebResponseUtils.bytesToWebResponse(
                tablesToCsv(result.tables()).getBytes(StandardCharsets.UTF_8),
                outputName(request.getFileInput(), "_tables.csv"),
                CSV);
    }

    /** Original + requested corpus files in one ZIP, so destinations receive them together. */
    private byte[] exportZip(
            String fileName, byte[] original, RagIngestResponse result, RagIngestApiRequest request)
            throws IOException {
        String base = baseName(fileName);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry(fileName));
            zip.write(original);
            zip.closeEntry();
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

    private void writeParts(TempFile sourceTempFile, List<SplitPart> parts, ZipOutputStream zipOut)
            throws IOException {
        for (int i = 0; i < parts.size(); i++) {
            SplitPart part = parts.get(i);
            // Load per part and remove pages outside the range: avoids the PDFBox cross-document
            // addPage pitfalls while keeping shared resources intact.
            try (PDDocument partDoc = pdfDocumentFactory.load(sourceTempFile.getFile())) {
                int pageCount = partDoc.getNumberOfPages();
                int start = Math.clamp(part.startPage(), 1, pageCount);
                int end = Math.clamp(part.endPage(), start, pageCount);
                for (int p = pageCount - 1; p >= 0; p--) {
                    int pageNumber = p + 1;
                    if (pageNumber < start || pageNumber > end) {
                        partDoc.removePage(p);
                    }
                }
                FormUtils.pruneOrphanedFormFields(partDoc);
                zipOut.putNextEntry(new ZipEntry(partEntryName(i, part)));
                partDoc.save(zipOut);
                zipOut.closeEntry();
            }
        }
    }

    private static String partEntryName(int index, SplitPart part) {
        String label = part.label() == null ? "" : part.label().trim();
        String sanitized = label.replaceAll("[^A-Za-z0-9 ._-]", "_").replaceAll("\\s+", "_");
        if (sanitized.isBlank() || sanitized.chars().allMatch(c -> c == '_' || c == '.')) {
            sanitized = "part";
        }
        // Index prefix keeps entries unique even when labels repeat.
        return String.format(Locale.ROOT, "%02d_%s.pdf", index + 1, sanitized);
    }

    private static String tablesToCsv(List<DocTable> tables) throws IOException {
        CSVFormat format = CSVFormat.EXCEL.builder().setEscape('"').build();
        StringWriter writer = new StringWriter();
        try (CSVPrinter printer = format.print(writer)) {
            boolean first = true;
            for (DocTable table : tables) {
                if (!first) {
                    printer.println();
                }
                first = false;
                for (List<String> row : table.cells()) {
                    printer.printRecord(row);
                }
            }
        }
        return writer.toString();
    }

    private static String outputName(MultipartFile file, String suffix) {
        return GeneralUtils.removeExtension(DocParseService.fileName(file)) + suffix;
    }
}
