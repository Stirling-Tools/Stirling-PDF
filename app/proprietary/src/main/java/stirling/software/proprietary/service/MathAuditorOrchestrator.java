package stirling.software.proprietary.service;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.proprietary.model.api.ai.Evidence;
import stirling.software.proprietary.model.api.ai.Folio;
import stirling.software.proprietary.model.api.ai.FolioManifest;
import stirling.software.proprietary.model.api.ai.FolioType;
import stirling.software.proprietary.model.api.ai.Requisition;
import stirling.software.proprietary.model.api.ai.Verdict;

import tools.jackson.databind.ObjectMapper;

/**
 * Orchestrator for the Math Auditor Agent (mathAuditorAgent).
 *
 * <p>Manages a four-step Java-Python protocol:
 *
 * <ol>
 *   <li>Classify all pages cheaply with PDFBox (no OCR or Tabula yet).
 *   <li>Send the {@link FolioManifest} to the Python Examiner; receive a {@link Requisition}.
 *   <li>Fulfil the Requisition (text / tables / OCR) for only the requested pages.
 *   <li>Send the {@link Evidence} to the Python Auditor; receive a {@link Verdict}.
 * </ol>
 *
 * <p>The raw PDF never leaves Java. Python only receives structured text and CSV data.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MathAuditorOrchestrator {

    private static final String EXAMINE_PATH = "/api/v1/ai/math-auditor-agent/examine";
    private static final String DELIBERATE_PATH = "/api/v1/ai/math-auditor-agent/deliberate";

    private final AiEngineClient aiEngineClient;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final PdfContentExtractor pdfContentExtractor;
    private final ObjectMapper objectMapper;

    /**
     * Run a full math audit against the supplied PDF file.
     *
     * @param pdfFile The uploaded PDF to audit.
     * @param tolerance Arithmetic tolerance — differences smaller than this are ignored.
     * @return The Auditor's final Verdict.
     */
    public Verdict audit(MultipartFile pdfFile, BigDecimal tolerance) throws IOException {
        String sessionId = UUID.randomUUID().toString();
        log.info(
                "[math-auditor-agent] audit started session={} file={} tolerance={}",
                sessionId,
                pdfFile.getOriginalFilename(),
                tolerance);

        try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {
            // Round 1: classify pages cheaply; send manifest; get requisition
            List<FolioType> folioTypes = classifyPages(document);
            FolioManifest manifest =
                    new FolioManifest(sessionId, document.getNumberOfPages(), folioTypes, 1);

            Requisition requisition = callExamine(manifest);
            log.info(
                    "[math-auditor-agent] session={} requisition received: {}",
                    sessionId,
                    requisition.rationale());

            // Round 2: fulfil the requisition and get verdict
            Evidence evidence = fulfil(document, sessionId, requisition, 2, true);
            Verdict verdict = callDeliberate(evidence, tolerance);

            if (verdict == null) {
                log.error(
                        "[math-auditor-agent] session={} null Verdict from deliberate", sessionId);
                throw new IllegalStateException("Math Auditor Agent returned null Verdict");
            }

            log.info(
                    "[math-auditor-agent] session={} verdict: {} errors, {} warnings,"
                            + " clean={}",
                    sessionId,
                    verdict.errorCount(),
                    verdict.warningCount(),
                    verdict.clean());
            return verdict;
        }
    }

    // -----------------------------------------------------------------------
    // Python engine calls
    // -----------------------------------------------------------------------

    private Requisition callExamine(FolioManifest manifest) throws IOException {
        String requestBody = objectMapper.writeValueAsString(manifest);
        log.info(
                "[math-auditor-agent] POST {} session={} round={}",
                EXAMINE_PATH,
                manifest.sessionId(),
                manifest.round());
        String responseBody = aiEngineClient.post(EXAMINE_PATH, requestBody);
        return objectMapper.readValue(responseBody, Requisition.class);
    }

    private Verdict callDeliberate(Evidence evidence, BigDecimal tolerance) throws IOException {
        String path = DELIBERATE_PATH + "?tolerance=" + tolerance.toPlainString();
        String requestBody = objectMapper.writeValueAsString(evidence);
        log.info(
                "[math-auditor-agent] POST {} session={} round={} final={}",
                path,
                evidence.sessionId(),
                evidence.round(),
                evidence.finalRound());
        String responseBody = aiEngineClient.post(path, requestBody);
        return objectMapper.readValue(responseBody, Verdict.class);
    }

    // -----------------------------------------------------------------------
    // Page classification
    // -----------------------------------------------------------------------

    private List<FolioType> classifyPages(PDDocument document) throws IOException {
        List<FolioType> types = new ArrayList<>();
        for (int page = 1; page <= document.getNumberOfPages(); page++) {
            types.add(pdfContentExtractor.classifyPage(document, page));
        }
        return types;
    }

    // -----------------------------------------------------------------------
    // Requisition fulfilment
    // -----------------------------------------------------------------------

    private Evidence fulfil(
            PDDocument document,
            String sessionId,
            Requisition requisition,
            int round,
            boolean finalRound)
            throws IOException {

        List<Integer> allPages =
                union(requisition.needText(), requisition.needTables(), requisition.needOcr());
        int totalPages = document.getNumberOfPages();
        allPages.removeIf(page -> page < 0 || page >= totalPages);
        if (allPages.isEmpty()) {
            log.warn(
                    "[math-auditor-agent] session={} all requested pages are out of bounds",
                    sessionId);
        }
        List<Folio> folios = new ArrayList<>();
        List<Integer> unauditablePages = new ArrayList<>();

        for (int page : allPages) {
            // Page indices from Python are 0-based; PdfContentExtractor uses 1-based
            int pageNumber = page + 1;
            String text = null;
            List<String> tables = null;
            String ocrText = null;

            if (contains(requisition.needText(), page)) {
                text = pdfContentExtractor.extractPageTextRaw(document, pageNumber);
            }
            if (contains(requisition.needTables(), page)) {
                tables = pdfContentExtractor.extractTablesAsCsv(document, pageNumber);
            }
            if (contains(requisition.needOcr(), page)) {
                log.warn(
                        "[math-auditor-agent] session={} OCR requested for page {} but not yet"
                                + " wired - marking unauditable",
                        sessionId,
                        page);
                unauditablePages.add(page);
            }

            if (text != null || tables != null) {
                folios.add(new Folio(page, text, tables, ocrText, null));
            }
        }

        log.info(
                "[math-auditor-agent] session={} fulfilled round {} with {} folios, {}"
                        + " unauditable pages",
                sessionId,
                round,
                folios.size(),
                unauditablePages.size());
        return new Evidence(sessionId, folios, round, finalRound, unauditablePages);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    @SafeVarargs
    private static List<Integer> union(List<Integer>... lists) {
        List<Integer> result = new ArrayList<>();
        for (List<Integer> list : lists) {
            if (list != null) {
                for (int page : list) {
                    if (!result.contains(page)) {
                        result.add(page);
                    }
                }
            }
        }
        Collections.sort(result);
        return result;
    }

    private static boolean contains(List<Integer> list, int value) {
        return list != null && list.contains(value);
    }
}
