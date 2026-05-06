package stirling.software.proprietary.service;

import static stirling.software.SPDF.pdf.parser.PdfModels.*;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.pdf.parser.PdfIngester;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Parses each PDF via {@link PdfIngester}, serialises the full page layout, and POSTs it to the
 * Python engine's {@value #EXTRACT_PATH} endpoint. The engine handles chunking, parallel LLM calls,
 * and assembly, returning the reconstructed Markdown as a single response.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PdfToMarkdownService {

    private static final String EXTRACT_PATH = "/api/v1/pdf/to-markdown";

    private final AiEngineClient aiEngineClient;
    private final PdfIngester pdfIngester;
    private final ObjectMapper objectMapper;
    private final TempFileManager tempFileManager;

    /** Convert a PDF to Markdown. */
    public List<Resource> execute(MultipartFile fileInput, String userMessage) throws IOException {
        TempFile tempFile = tempFileManager.createManagedTempFile("pdf-to-markdown");
        fileInput.transferTo(tempFile.getPath());
        String name = Filenames.toSimpleFileName(fileInput.getOriginalFilename());
        Resource resource =
                new FileSystemResource(tempFile.getFile()) {
                    @Override
                    public String getFilename() {
                        return name;
                    }
                };
        return extractFromFile(resource, userMessage);
    }

    // ── private helpers ──────────────────────────────────────────────────────────────────────────

    private List<Resource> extractFromFile(Resource file, String userMessage) throws IOException {
        String baseName = baseName(file);

        // qpdf decompresses content streams so PDFBox 3.x can parse them.
        repairWithQpdf(file.getFile());

        List<ParsedPage> allPages;
        long tLoad = System.currentTimeMillis();
        try (PDDocument document = Loader.loadPDF(file.getFile())) {
            log.info("[timing] load={}ms", System.currentTimeMillis() - tLoad);
            allPages = pdfIngester.parse(document);
        }

        int totalPages = allPages.size();
        int layoutPages = (int) allPages.stream().filter(p -> !p.layoutLines().isEmpty()).count();
        int totalFragments =
                allPages.stream()
                        .mapToInt(
                                p ->
                                        p.layoutLines().stream()
                                                .mapToInt(l -> l.fragments().size())
                                                .sum())
                        .sum();

        log.info(
                "[data-extraction] file={} pages={} layout-pages={} fragments={}",
                baseName,
                totalPages,
                layoutPages,
                totalFragments);

        ArrayNode fullLayout = buildPageLayoutJson(allPages);
        String reqJson = objectMapper.writeValueAsString(buildRequest(userMessage, fullLayout));

        long tPost = System.currentTimeMillis();
        String body = aiEngineClient.post(EXTRACT_PATH, reqJson);
        tools.jackson.databind.JsonNode root = objectMapper.readTree(body);

        String outcome = root.path("outcome").asText("");
        if ("document_reconstructed".equals(outcome)) {
            String markdown = root.path("markdown").asText("");
            log.info(
                    "[timing] file={} total={}ms markdown-chars={}",
                    baseName,
                    System.currentTimeMillis() - tPost,
                    markdown.length());
            return buildReconstructionOutputFiles(markdown, baseName);
        }
        if ("cannot_do".equals(outcome)) {
            throw new IOException(
                    "PDF to Markdown failed: " + root.path("reason").asText("unknown"));
        }
        throw new IOException("Unexpected outcome from engine: " + outcome);
    }

    /**
     * Decompresses PDF content streams via qpdf so PDFBox can parse them; silently skipped if qpdf
     * is unavailable.
     */
    private void repairWithQpdf(File pdfFile) {
        try {
            Process process =
                    new ProcessBuilder(
                                    "qpdf",
                                    "--stream-data=uncompress",
                                    "--replace-input",
                                    pdfFile.getAbsolutePath())
                            .redirectErrorStream(true)
                            .start();
            // Drain stdout/stderr so the process doesn't block on a full pipe buffer.
            try (var is = process.getInputStream()) {
                is.transferTo(java.io.OutputStream.nullOutputStream());
            }
            boolean finished = process.waitFor(30, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                log.debug("[data-extraction] qpdf timed out, killed: {}", pdfFile.getName());
                return;
            }
            log.debug(
                    "[data-extraction] qpdf exit={} file={}",
                    process.exitValue(),
                    pdfFile.getName());
        } catch (Exception e) {
            log.debug("[data-extraction] qpdf unavailable or failed, skipping: {}", e.getMessage());
        }
    }

    private ObjectNode buildRequest(String userMessage, ArrayNode pageLayout) {
        ObjectNode req = objectMapper.createObjectNode();
        req.put("userMessage", userMessage);
        req.set("pageLayout", pageLayout);
        req.set("fileNames", objectMapper.createArrayNode());
        req.set("conversationHistory", objectMapper.createArrayNode());
        return req;
    }

    /**
     * Serialises layout lines to JSON for the Python engine: {@code {pageNumber, lines:[{y,
     * fragments:[...]}]}}.
     */
    private ArrayNode buildPageLayoutJson(List<ParsedPage> pages) {
        ArrayNode result = objectMapper.createArrayNode();
        for (ParsedPage page : pages) {
            if (page.layoutLines().isEmpty()) continue;
            ObjectNode pageNode = objectMapper.createObjectNode();
            pageNode.put("pageNumber", page.pageNumber());
            ArrayNode linesArray = objectMapper.createArrayNode();
            for (RawLine line : page.layoutLines()) {
                ObjectNode lineNode = objectMapper.createObjectNode();
                lineNode.put("y", line.bounds().y());
                ArrayNode frags = objectMapper.createArrayNode();
                for (TextFragment frag : line.fragments()) {
                    ObjectNode fragNode = objectMapper.createObjectNode();
                    fragNode.put("text", frag.text());
                    fragNode.put("x", frag.bounds().x());
                    fragNode.put("y", frag.bounds().y());
                    fragNode.put("width", frag.bounds().width());
                    fragNode.put("fontSize", frag.fontSize());
                    fragNode.put("bold", frag.bold());
                    frags.add(fragNode);
                }
                lineNode.set("fragments", frags);
                linesArray.add(lineNode);
            }
            pageNode.set("lines", linesArray);
            result.add(pageNode);
        }
        return result;
    }

    private List<Resource> buildReconstructionOutputFiles(String markdown, String baseName)
            throws IOException {
        return List.of(
                writeToTempFile(
                        markdown.getBytes(StandardCharsets.UTF_8),
                        baseName + "-reconstruction.md"));
    }

    private Resource writeToTempFile(byte[] content, String filename) throws IOException {
        TempFile tempFile = tempFileManager.createManagedTempFile("data-extraction");
        Files.write(tempFile.getPath(), content);
        return new FileSystemResource(tempFile.getFile()) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }

    private static String baseName(Resource resource) {
        String name = resource.getFilename();
        if (name == null) return "document";
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }
}
