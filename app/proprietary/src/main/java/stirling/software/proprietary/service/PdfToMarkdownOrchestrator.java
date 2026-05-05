package stirling.software.proprietary.service;

import static stirling.software.SPDF.pdf.parser.PdfModels.*;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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

    /** Max chars per chunk — keeps output tokens safely below the LLM's 8192-token limit. */
    private static final int MAX_CHUNK_INPUT_CHARS = 10_000;

    /** Page cap — prevents low-text pages from accumulating into an oversized chunk. */
    private static final int MAX_CHUNK_PAGES = 10;

    /** Minimum chars charged per page so low-text pages still count toward the chunk budget. */
    private static final int MIN_PAGE_CHARS = 300;

    /** Max concurrent LLM calls — limits upstream API rate pressure on large documents. */
    private static final int MAX_PARALLEL_CHUNKS = 5;

    private final AiEngineClient aiEngineClient;
    private final PdfIngester pdfIngester;
    private final PdfContentExtractor pdfContentExtractor;
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

        // Hold the byte array in scope for the entire method. PDFBox 3.x closes the
        // RandomAccessReadBuffer after the initial xref parse; keeping a strong local reference
        // prevents the GC from collecting the backing array before lazy dereferences complete.
        byte[] pdfBytes = java.nio.file.Files.readAllBytes(file.getFile().toPath());

        List<ParsedPage> allPages;
        ArrayNode allPageTextJson;

        long tLoad = System.currentTimeMillis();
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            log.info("[timing] load={}ms", System.currentTimeMillis() - tLoad);

            allPages = pdfIngester.parse(document); // parse emits its own [timing] line

            long tText = System.currentTimeMillis();
            allPageTextJson = extractPageTextJson(document, file.getFile(), baseName + ".pdf");
            log.info("[timing] extract-text={}ms", System.currentTimeMillis() - tText);
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
        int totalTables = allPages.stream().mapToInt(p -> p.tables().size()).sum();
        List<List<ParsedPage>> pageChunks = buildPageChunks(allPages);
        int totalChunks = pageChunks.size();

        log.info(
                "[data-extraction] file={} pages={} layout-pages={} fragments={} tables={} chunks={}",
                baseName,
                totalPages,
                layoutPages,
                totalFragments,
                totalTables,
                totalChunks);

        long tTotal = System.currentTimeMillis();

        // Build all chunk request JSONs on the calling thread (fast — JSON serialisation only).
        record ChunkSpec(int chunkNum, String json) {}
        List<ChunkSpec> chunks = new ArrayList<>(totalChunks);
        for (int ci = 0; ci < pageChunks.size(); ci++) {
            int chunkNum = ci + 1;
            List<ParsedPage> chunkPages = pageChunks.get(ci);
            int firstPage = chunkPages.get(0).pageNumber();
            int lastPage = chunkPages.get(chunkPages.size() - 1).pageNumber();

            ArrayNode chunkTables = buildParsedTablesJson(chunkPages);
            ArrayNode chunkLayout = buildPageLayoutJson(chunkPages);
            ArrayNode chunkText = filterPageText(allPageTextJson, firstPage, lastPage);

            int chunkLayoutPages =
                    (int) chunkPages.stream().filter(p -> !p.layoutLines().isEmpty()).count();
            log.info(
                    "[data-extraction] chunk {}/{} pages={}-{} layout-pages={} tables={}"
                            + " text-pages={}",
                    chunkNum,
                    totalChunks,
                    firstPage,
                    lastPage,
                    chunkLayoutPages,
                    chunkTables.size(),
                    chunkText.isEmpty() ? 0 : chunkText.get(0).path("pages").size());

            ObjectNode req = buildRequest(userMessage, chunkTables, chunkText, chunkLayout);
            chunks.add(new ChunkSpec(chunkNum, objectMapper.writeValueAsString(req)));
        }

        log.info(
                "[data-extraction] firing {} chunks (max {} in parallel)",
                totalChunks,
                MAX_PARALLEL_CHUNKS);
        Semaphore semaphore = new Semaphore(MAX_PARALLEL_CHUNKS);
        List<CompletableFuture<String>> futures = new ArrayList<>(totalChunks);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (ChunkSpec chunk : chunks) {
                final ChunkSpec c = chunk;
                futures.add(
                        CompletableFuture.supplyAsync(
                                () -> {
                                    try {
                                        semaphore.acquire();
                                    } catch (InterruptedException e) {
                                        Thread.currentThread().interrupt();
                                        throw new RuntimeException(
                                                "Interrupted waiting for chunk slot", e);
                                    }
                                    long tChunk = System.currentTimeMillis();
                                    try {
                                        String body = aiEngineClient.post(EXTRACT_PATH, c.json());
                                        tools.jackson.databind.JsonNode root =
                                                objectMapper.readTree(body);
                                        String outcome = root.path("outcome").asText("");
                                        if ("document_reconstructed".equals(outcome)) {
                                            String md = root.path("markdown").asText("");
                                            log.info(
                                                    "[timing] chunk {}/{} http={}ms"
                                                            + " markdown-chars={}",
                                                    c.chunkNum(),
                                                    totalChunks,
                                                    System.currentTimeMillis() - tChunk,
                                                    md.length());
                                            return md;
                                        }
                                        if ("cannot_do".equals(outcome)) {
                                            log.warn(
                                                    "[data-extraction] chunk {}/{} cannot_do: {}",
                                                    c.chunkNum(),
                                                    totalChunks,
                                                    root.path("reason").asText("unknown"));
                                            return "";
                                        }
                                        throw new IllegalStateException(
                                                "Unexpected outcome: " + outcome);
                                    } catch (IOException e) {
                                        throw new java.io.UncheckedIOException(e);
                                    } finally {
                                        semaphore.release();
                                    }
                                },
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
    private static List<List<ParsedPage>> buildPageChunks(List<ParsedPage> pages) {
        List<List<ParsedPage>> chunks = new ArrayList<>();
        List<ParsedPage> current = new ArrayList<>();
        int currentChars = 0;
        for (ParsedPage page : pages) {
            int pageChars = Math.max(countPageChars(page), MIN_PAGE_CHARS);
            boolean charBudgetFull =
                    !current.isEmpty() && currentChars + pageChars > MAX_CHUNK_INPUT_CHARS;
            boolean pageBudgetFull = current.size() >= MAX_CHUNK_PAGES;
            if (charBudgetFull || pageBudgetFull) {
                chunks.add(current);
                current = new ArrayList<>();
                currentChars = 0;
            }
            current.add(page);
            currentChars += pageChars;
        }
        if (!current.isEmpty()) chunks.add(current);
        return chunks;
    }

    /** Raw text character count for a page — proxy for output token cost. */
    private static int countPageChars(ParsedPage page) {
        return page.layoutLines().stream()
                .flatMap(line -> line.fragments().stream())
                .mapToInt(f -> f.text().length())
                .sum();
    }

    /** Filters {@code pageTextJson} to pages in [{@code first}, {@code last}]. */
    private ArrayNode filterPageText(ArrayNode pageTextJson, int first, int last) {
        ArrayNode result = objectMapper.createArrayNode();
        for (tools.jackson.databind.JsonNode fileNode : pageTextJson) {
            ObjectNode filtered = objectMapper.createObjectNode();
            filtered.put("fileName", fileNode.path("fileName").asText(""));
            ArrayNode filteredPages = objectMapper.createArrayNode();
            for (tools.jackson.databind.JsonNode pageNode : fileNode.path("pages")) {
                int num = pageNode.path("pageNumber").asInt();
                if (num >= first && num <= last) filteredPages.add(pageNode);
            }
            filtered.set("pages", filteredPages);
            result.add(filtered);
        }
        return result;
    }

    /** Converts all table fragments from all pages into a Jackson ArrayNode. */
    private ArrayNode buildParsedTablesJson(List<ParsedPage> pages) {
        ArrayNode tables = objectMapper.createArrayNode();
        for (ParsedPage page : pages) {
            for (TableFragment fragment : page.tables()) {
                tables.add(tableFragmentToJson(fragment));
            }
        }
        return tables;
    }

    private ObjectNode tableFragmentToJson(TableFragment f) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("tableId", f.tableId());
        node.put("pageNumber", f.pageNumber());
        node.set("rawRows", rawRowsToJson(f.rawRows()));
        node.put("columnCount", f.columnCount());
        node.put("confidence", f.confidence());
        ArrayNode warnings = objectMapper.createArrayNode();
        f.warnings().forEach(warnings::add);
        node.set("warnings", warnings);
        return node;
    }

    private ArrayNode rawRowsToJson(List<List<String>> rawRows) {
        ArrayNode outer = objectMapper.createArrayNode();
        for (List<String> row : rawRows) {
            ArrayNode inner = objectMapper.createArrayNode();
            row.forEach(inner::add);
            outer.add(inner);
        }
        return outer;
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

    /**
     * Extracts text per page via PDFBox and pdftotext, keeping whichever yields more characters. No
     * OCR.
     */
    private ArrayNode extractPageTextJson(PDDocument document, File pdfFile, String fileName)
            throws IOException {
        int numPages = document.getNumberOfPages();

        Map<Integer, String> pdfboxPages = new java.util.LinkedHashMap<>();
        for (int page = 1; page <= numPages; page++) {
            String text = pdfContentExtractor.extractPageTextRaw(document, page);
            if (!text.isBlank()) {
                pdfboxPages.put(page, text);
            }
        }

        Map<Integer, String> pdftotextPages = extractViaPdfToText(pdfFile);

        // Per page: prefer whichever source extracted more characters.
        ArrayNode pagesArray = objectMapper.createArrayNode();
        java.util.TreeSet<Integer> allPageNums = new java.util.TreeSet<>();
        allPageNums.addAll(pdfboxPages.keySet());
        allPageNums.addAll(pdftotextPages.keySet());

        for (int page : allPageNums) {
            String pdfbox = pdfboxPages.getOrDefault(page, "");
            String pdftt = pdftotextPages.getOrDefault(page, "");
            String best = pdftt.length() > pdfbox.length() ? pdftt : pdfbox;
            if (!best.isBlank()) {
                addPageNode(pagesArray, page, best);
            }
        }

        log.info("[data-extraction] text: {}/{} page(s) non-empty", pagesArray.size(), numPages);
        ObjectNode fileText = objectMapper.createObjectNode();
        fileText.put("fileName", fileName);
        fileText.set("pages", pagesArray);
        ArrayNode result = objectMapper.createArrayNode();
        result.add(fileText);
        return result;
    }

    private Map<Integer, String> extractViaPdfToText(File pdfFile) {
        Map<Integer, String> pages = new java.util.LinkedHashMap<>();
        try {
            Process process =
                    new ProcessBuilder("pdftotext", "-layout", pdfFile.getAbsolutePath(), "-")
                            .redirectErrorStream(false)
                            .start();
            String allText;
            try (var is = process.getInputStream()) {
                allText = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            }
            try (var err = process.getErrorStream()) {
                err.transferTo(java.io.OutputStream.nullOutputStream());
            }
            boolean finished = process.waitFor(30, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return pages;
            }
            if (process.exitValue() != 0) {
                return pages;
            }
            String[] pageTexts = allText.split("\f");
            for (int i = 0; i < pageTexts.length; i++) {
                String text = pageTexts[i].trim();
                if (!text.isBlank()) {
                    pages.put(i + 1, text);
                }
            }
        } catch (Exception e) {
            log.debug("[data-extraction] pdftotext unavailable: {}", e.getMessage());
        }
        return pages;
    }

    private void addPageNode(ArrayNode arr, int pageNumber, String text) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("pageNumber", pageNumber);
        node.put("text", text);
        arr.add(node);
    }

    private ObjectNode buildRequest(
            String userMessage, ArrayNode parsedTables, ArrayNode pageText, ArrayNode pageLayout) {
        ObjectNode req = objectMapper.createObjectNode();
        req.put("userMessage", userMessage);
        req.set("parsedTables", parsedTables);
        req.set("pageText", pageText);
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
