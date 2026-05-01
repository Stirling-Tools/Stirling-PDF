package stirling.software.proprietary.service;

import java.io.IOException;
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
import stirling.software.proprietary.model.api.ai.contradiction.ContradictionVerdict;

import tools.jackson.databind.ObjectMapper;

/**
 * Orchestrator for the Contradiction Agent (contradictionAgent).
 *
 * <p>Manages a four-step Java-Python protocol that mirrors the Math Auditor's, but for
 * <strong>textual</strong> contradictions only. Tables are <em>never</em> requested — this agent
 * looks for arguments, claimed facts, points of view, and recommendations that disagree across the
 * document.
 *
 * <ol>
 *   <li>Classify all pages cheaply with PDFBox (no OCR or Tabula).
 *   <li>Send the {@link FolioManifest} to the Python Examiner; receive a {@link Requisition}.
 *   <li>Fulfil the Requisition (text / OCR only — never tables) for the requested pages.
 *   <li>Send the {@link Evidence} to the Python Detector; receive a {@link ContradictionVerdict}.
 * </ol>
 *
 * <p>The raw PDF never leaves Java. Python only receives structured text data.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ContradictionAgentOrchestrator {

    private static final String EXAMINE_PATH = "/api/v1/ai/contradiction-agent/examine";
    private static final String DELIBERATE_PATH = "/api/v1/ai/contradiction-agent/deliberate";

    private final AiEngineClient aiEngineClient;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final PdfContentExtractor pdfContentExtractor;
    private final ObjectMapper objectMapper;

    /**
     * Run a full contradiction audit against the supplied PDF file.
     *
     * @param pdfFile The uploaded PDF to audit.
     * @return The Contradiction Agent's final {@link ContradictionVerdict}.
     */
    public ContradictionVerdict audit(MultipartFile pdfFile) throws IOException {
        String sessionId = UUID.randomUUID().toString();
        log.info(
                "[contradiction-agent] audit started session={} file={}",
                sessionId,
                pdfFile.getOriginalFilename());

        try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {
            // Round 1: classify pages cheaply; send manifest; get requisition
            List<FolioType> folioTypes = classifyPages(document);
            FolioManifest manifest =
                    new FolioManifest(sessionId, document.getNumberOfPages(), folioTypes, 1);

            Requisition requisition = callExamine(manifest);
            log.info(
                    "[contradiction-agent] session={} requisition received: {}",
                    sessionId,
                    requisition.rationale());

            // Round 2: fulfil the requisition and get verdict
            Evidence evidence = fulfil(document, sessionId, requisition, 2, true);
            ContradictionVerdict verdict = callDeliberate(evidence);

            if (verdict == null) {
                log.error(
                        "[contradiction-agent] session={} null ContradictionVerdict from"
                                + " deliberate",
                        sessionId);
                throw new IllegalStateException(
                        "Contradiction Agent returned null ContradictionVerdict");
            }

            log.info(
                    "[contradiction-agent] session={} verdict: {} errors, {} warnings, clean={}",
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
                "[contradiction-agent] POST {} session={} round={}",
                EXAMINE_PATH,
                manifest.sessionId(),
                manifest.round());
        String responseBody = aiEngineClient.post(EXAMINE_PATH, requestBody);
        return objectMapper.readValue(responseBody, Requisition.class);
    }

    private ContradictionVerdict callDeliberate(Evidence evidence) throws IOException {
        String requestBody = objectMapper.writeValueAsString(evidence);
        log.info(
                "[contradiction-agent] POST {} session={} round={} final={}",
                DELIBERATE_PATH,
                evidence.sessionId(),
                evidence.round(),
                evidence.finalRound());
        String responseBody = aiEngineClient.post(DELIBERATE_PATH, requestBody);
        return objectMapper.readValue(responseBody, ContradictionVerdict.class);
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

        // The contradiction agent never asks for tables; honour text + OCR only.
        List<Integer> allPages = union(requisition.needText(), requisition.needOcr());
        int totalPages = document.getNumberOfPages();
        allPages.removeIf(page -> page < 0 || page >= totalPages);
        if (allPages.isEmpty()) {
            log.warn(
                    "[contradiction-agent] session={} all requested pages are out of bounds",
                    sessionId);
        }
        List<Folio> folios = new ArrayList<>();
        List<Integer> unauditablePages = new ArrayList<>();

        for (int page : allPages) {
            // Page indices from Python are 0-based; PdfContentExtractor uses 1-based
            int pageNumber = page + 1;
            String text = null;
            String ocrText = null;

            if (contains(requisition.needText(), page)) {
                text = pdfContentExtractor.extractPageTextRaw(document, pageNumber);
            }
            if (contains(requisition.needOcr(), page)) {
                log.warn(
                        "[contradiction-agent] session={} OCR requested for page {} but not yet"
                                + " wired - marking unauditable",
                        sessionId,
                        page);
                unauditablePages.add(page);
            }

            if (text != null) {
                // tables intentionally null — contradiction agent is textual only
                folios.add(new Folio(page, text, null, ocrText, null));
            }
        }

        log.info(
                "[contradiction-agent] session={} fulfilled round {} with {} folios, {}"
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
