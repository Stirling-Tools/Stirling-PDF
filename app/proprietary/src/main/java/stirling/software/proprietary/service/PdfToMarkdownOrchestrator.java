package stirling.software.proprietary.service;

import static stirling.software.SPDF.pdf.parser.PdfModels.*;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
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
 * Parses each PDF via {@link PdfIngester}, chunks the layout data by content size, and POSTs each
 * chunk to the Python engine's {@value #EXTRACT_PATH} endpoint in parallel. Assembles and returns
 * the reconstructed Markdown as a downloadable resource.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PdfToMarkdownOrchestrator {

    private static final String EXTRACT_PATH = "/api/v1/pdf/to-markdown";

    /** Max text chars per chunk — coarse proxy for LLM output token cost. */
    private static final int MAX_CHUNK_INPUT_CHARS = 3_000;

    /**
     * Max fragments per chunk — tighter proxy for actual JSON payload size. Each fragment carries
     * x/y/width/fontSize/bold metadata beyond its text, so fragment count drives payload size more
     * than text length alone.
     */
    private static final int MAX_CHUNK_FRAGMENTS = 1_000;

    /** Page cap — prevents low-text pages from accumulating into an oversized chunk. */
    private static final int MAX_CHUNK_PAGES = 10;

    /** Minimum chars charged per page so low-text pages still count toward the chunk budget. */
    private static final int MIN_PAGE_CHARS = 300;

    /** Max concurrent LLM calls — limits upstream API rate pressure on large documents. */
    private static final int MAX_PARALLEL_CHUNKS = 3;

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

            allPages = pdfIngester.parse(document); // parse emits its own [timing] line
        }

        int totalPages = allPages.size();
        int layoutPages = (int) allPages.stream().filter(p -> !p.layoutLines().isEmpty()).count();
        int totalFragments = allPages.stream().mapToInt(PdfToMarkdownOrchestrator::countPageFragments).sum();
        List<List<ParsedPage>> pageChunks = buildPageChunks(allPages);
        int totalChunks = pageChunks.size();

        log.info(
                "[data-extraction] file={} pages={} layout-pages={} fragments={} chunks={}",
                baseName,
                totalPages,
                layoutPages,
                totalFragments,
                totalChunks);

        long tTotal = System.currentTimeMillis();

        // Build all chunk request JSONs on the calling thread (fast — JSON serialisation only).
        record ChunkSpec(int chunkNum, String json) {}
        List<ChunkSpec> chunks = new ArrayList<>(totalChunks);
        for (int ci = 0; ci < pageChunks.size(); ci++) {
            int chunkNum = ci + 1;
            List<ParsedPage> chunkPages = pageChunks.get(ci);
            ArrayNode chunkLayout = buildPageLayoutJson(chunkPages);
            String reqJson =
                    objectMapper.writeValueAsString(buildRequest(userMessage, chunkLayout));
            chunks.add(new ChunkSpec(chunkNum, reqJson));
        }
        Semaphore semaphore = new Semaphore(MAX_PARALLEL_CHUNKS);
        List<CompletableFuture<String>> futures = new ArrayList<>(totalChunks);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (ChunkSpec chunk : chunks) {
                futures.add(
                        CompletableFuture.supplyAsync(
                                () ->
                                        processChunk(
                                                chunk.chunkNum(),
                                                chunk.json(),
                                                semaphore,
                                                totalChunks),
                                executor));
            }

            // Collect results in page order (futures preserve insertion order).
            List<String> markdownParts = new ArrayList<>(futures.size());
            for (int i = 0; i < futures.size(); i++) {
                try {
                    String md = futures.get(i).get();
                    if (md != null && !md.isEmpty()) markdownParts.add(md);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    futures.forEach(f -> f.cancel(true));
                    throw new IOException("Interrupted waiting for chunk " + (i + 1), e);
                } catch (ExecutionException e) {
                    futures.forEach(f -> f.cancel(true));
                    Throwable cause = e.getCause();
                    if (cause instanceof java.io.UncheckedIOException uioe) throw uioe.getCause();
                    if (cause instanceof IOException ioe) throw ioe;
                    throw new IOException(
                            "Chunk " + (i + 1) + " failed: " + cause.getMessage(), cause);
                }
            }

            log.info(
                    "[data-extraction] assembly: {}/{} chunks produced output (dropped={})",
                    markdownParts.size(),
                    totalChunks,
                    totalChunks - markdownParts.size());

            if (markdownParts.isEmpty()) {
                throw new IOException(
                        "Data extraction could not reconstruct any pages of: " + baseName);
            }

            String fullMarkdown = String.join("\n\n", markdownParts);
            log.info(
                    "[timing] file={} chunks={} total={}ms markdown-chars={}",
                    baseName,
                    markdownParts.size(),
                    System.currentTimeMillis() - tTotal,
                    fullMarkdown.length());

            return buildReconstructionOutputFiles(fullMarkdown, baseName);
        }
    }

    /**
     * Groups pages into content-size chunks; a page that exceeds the budget alone forms its own
     * chunk.
     */
    private String processChunk(int chunkNum, String json, Semaphore semaphore, int totalChunks) {
        try {
            semaphore.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Interrupted waiting for chunk slot", e);
        }
        long tChunk = System.currentTimeMillis();
        try {
            String body = aiEngineClient.post(EXTRACT_PATH, json);
            tools.jackson.databind.JsonNode root = objectMapper.readTree(body);
            String outcome = root.path("outcome").asText("");
            if ("document_reconstructed".equals(outcome)) {
                String md = root.path("markdown").asText("");
                log.info(
                        "[timing] chunk {}/{} http={}ms markdown-chars={}",
                        chunkNum,
                        totalChunks,
                        System.currentTimeMillis() - tChunk,
                        md.length());
                return md;
            }
            if ("cannot_do".equals(outcome)) {
                log.warn(
                        "[data-extraction] chunk {}/{} DROPPED — cannot_do: {}",
                        chunkNum,
                        totalChunks,
                        root.path("reason").asText("unknown"));
                return "";
            }
            throw new IllegalStateException("Unexpected outcome: " + outcome);
        } catch (IOException e) {
            throw new java.io.UncheckedIOException(e);
        } finally {
            semaphore.release();
        }
    }

    private static List<List<ParsedPage>> buildPageChunks(List<ParsedPage> pages) {
        List<List<ParsedPage>> chunks = new ArrayList<>();
        List<ParsedPage> current = new ArrayList<>();
        int currentChars = 0;
        int currentFragments = 0;
        for (ParsedPage page : pages) {
            int pageChars = Math.max(countPageChars(page), MIN_PAGE_CHARS);
            int pageFragments = countPageFragments(page);
            boolean charBudgetFull =
                    !current.isEmpty() && currentChars + pageChars > MAX_CHUNK_INPUT_CHARS;
            boolean fragmentBudgetFull =
                    !current.isEmpty() && currentFragments + pageFragments > MAX_CHUNK_FRAGMENTS;
            boolean pageBudgetFull = current.size() >= MAX_CHUNK_PAGES;
            if (charBudgetFull || fragmentBudgetFull || pageBudgetFull) {
                chunks.add(current);
                current = new ArrayList<>();
                currentChars = 0;
                currentFragments = 0;
            }
            current.add(page);
            currentChars += pageChars;
            currentFragments += pageFragments;
        }
        if (!current.isEmpty()) chunks.add(current);
        return chunks;
    }

    private static int countPageFragments(ParsedPage page) {
        return page.layoutLines().stream().mapToInt(l -> l.fragments().size()).sum();
    }

    /** Raw text character count for a page — proxy for output token cost. */
    private static int countPageChars(ParsedPage page) {
        return page.layoutLines().stream()
                .flatMap(line -> line.fragments().stream())
                .mapToInt(f -> f.text().length())
                .sum();
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
