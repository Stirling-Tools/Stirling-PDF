package stirling.software.proprietary.service;

import java.io.IOException;
import java.io.StringWriter;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.QuoteMode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.proprietary.model.api.ai.AgentTurn;
import stirling.software.proprietary.model.api.ai.Evidence;
import stirling.software.proprietary.model.api.ai.Folio;
import stirling.software.proprietary.model.api.ai.FolioManifest;
import stirling.software.proprietary.model.api.ai.FolioType;
import stirling.software.proprietary.model.api.ai.Requisition;
import stirling.software.proprietary.model.api.ai.Verdict;
import stirling.software.proprietary.pdf.FlexibleCSVWriter;

import technology.tabula.ObjectExtractor;
import technology.tabula.Page;
import technology.tabula.Table;
import technology.tabula.extractors.SpreadsheetExtractionAlgorithm;
import tools.jackson.databind.ObjectMapper;

/**
 * Orchestrator for the Math Auditor Agent (mathAuditorAgent).
 *
 * <p>Manages the multi-round Java-Python negotiation protocol:
 *
 * <ol>
 *   <li>Classify all pages cheaply with PDFBox (no OCR or Tabula yet).
 *   <li>Send the {@link FolioManifest} to the Python Examiner; receive a {@link Requisition}.
 *   <li>Fulfil the Requisition (text / tables / OCR) for only the requested pages.
 *   <li>Send the {@link Evidence} to the Python Auditor; receive an {@link AgentTurn}.
 *   <li>If the turn contains another Requisition, go to step 3. Max 3 rounds total.
 *   <li>Return the final {@link Verdict} to the caller.
 * </ol>
 *
 * <p>The raw PDF never leaves Java. Python only receives structured text and CSV data.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MathAuditorOrchestrator {

    private static final int MAX_ROUNDS = 3;
    private static final String EXAMINE_PATH = "/api/v1/ai/math-auditor-agent/examine";
    private static final String DELIBERATE_PATH = "/api/v1/ai/math-auditor-agent/deliberate";

    private final AiEngineClient aiEngineClient;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;

    /**
     * Run a full math audit against the supplied PDF file.
     *
     * @param pdfFile The uploaded PDF to audit.
     * @param tolerance Arithmetic tolerance — differences smaller than this are ignored.
     * @return The Auditor's final Verdict.
     */
    public Verdict audit(MultipartFile pdfFile, BigDecimal tolerance) throws Exception {
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

            // Rounds 2–MAX_ROUNDS: fulfil then deliberate
            for (int round = 2; round <= MAX_ROUNDS + 1; round++) {
                boolean isFinalRound = (round > MAX_ROUNDS);
                int evidenceRound = Math.min(round, MAX_ROUNDS);

                Evidence evidence =
                        fulfil(document, sessionId, requisition, evidenceRound, isFinalRound);
                AgentTurn turn = callDeliberate(evidence, tolerance);

                if (turn == null) {
                    log.error(
                            "[math-auditor-agent] session={} null AgentTurn on round {}",
                            sessionId,
                            round);
                    throw new IllegalStateException(
                            "Math Auditor Agent returned null on round " + round);
                }

                if (turn.isFinal()) {
                    Verdict verdict = turn.verdict();
                    log.info(
                            "[math-auditor-agent] session={} verdict: {} errors, {} warnings,"
                                    + " clean={}",
                            sessionId,
                            verdict.errorCount(),
                            verdict.warningCount(),
                            verdict.clean());
                    return verdict;
                }

                if (isFinalRound) {
                    log.warn(
                            "[math-auditor-agent] session={} Auditor returned Requisition on final"
                                    + " round — protocol violation",
                            sessionId);
                    throw new IllegalStateException(
                            "Math Auditor Agent exceeded max rounds without verdict");
                }

                requisition = turn.requisition();
                log.info(
                        "[math-auditor-agent] session={} round {} requisition: {}",
                        sessionId,
                        round,
                        requisition.rationale());
            }

            throw new IllegalStateException("Audit loop exited without verdict");
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

    private AgentTurn callDeliberate(Evidence evidence, BigDecimal tolerance) throws IOException {
        String path = DELIBERATE_PATH + "?tolerance=" + tolerance.toPlainString();
        String requestBody = objectMapper.writeValueAsString(evidence);
        log.info(
                "[math-auditor-agent] POST {} session={} round={} final={}",
                path,
                evidence.sessionId(),
                evidence.round(),
                evidence.finalRound());
        String responseBody = aiEngineClient.post(path, requestBody);
        return objectMapper.readValue(responseBody, AgentTurn.class);
    }

    // -----------------------------------------------------------------------
    // Page classification
    // -----------------------------------------------------------------------

    private List<FolioType> classifyPages(PDDocument document) throws Exception {
        List<FolioType> types = new ArrayList<>();
        PDFTextStripper stripper = new PDFTextStripper();

        for (int pageNum = 1; pageNum <= document.getNumberOfPages(); pageNum++) {
            stripper.setStartPage(pageNum);
            stripper.setEndPage(pageNum);
            String text = stripper.getText(document).strip();

            boolean hasText = text.length() > 20;
            boolean hasImages =
                    document.getPage(pageNum - 1).getResources().getXObjectNames() != null
                            && document.getPage(pageNum - 1)
                                    .getResources()
                                    .getXObjectNames()
                                    .iterator()
                                    .hasNext();

            if (hasText && hasImages) {
                types.add(FolioType.MIXED);
            } else if (hasText) {
                types.add(FolioType.TEXT);
            } else {
                types.add(FolioType.IMAGE);
            }
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
            throws Exception {

        List<Integer> allPages =
                union(requisition.needText(), requisition.needTables(), requisition.needOcr());
        List<Folio> folios = new ArrayList<>();
        List<Integer> unauditablePages = new ArrayList<>();

        boolean needsTableExtraction =
                requisition.needTables() != null && !requisition.needTables().isEmpty();
        ObjectExtractor tabulaExtractor =
                needsTableExtraction ? new ObjectExtractor(document) : null;

        for (int page : allPages) {
            String text = null;
            List<String> tables = null;
            String ocrText = null;

            if (contains(requisition.needText(), page)) {
                text = extractText(document, page);
            }
            if (contains(requisition.needTables(), page) && tabulaExtractor != null) {
                tables = extractTables(tabulaExtractor, page);
            }
            if (contains(requisition.needOcr(), page)) {
                log.warn(
                        "[math-auditor-agent] session={} OCR requested for page {} but not yet"
                                + " wired — marking unauditable",
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

    private String extractText(PDDocument document, int page) throws Exception {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setStartPage(page + 1);
        stripper.setEndPage(page + 1);
        return stripper.getText(document).strip();
    }

    private List<String> extractTables(ObjectExtractor extractor, int page) throws Exception {
        SpreadsheetExtractionAlgorithm sea = new SpreadsheetExtractionAlgorithm();
        CSVFormat format =
                CSVFormat.EXCEL.builder().setEscape('"').setQuoteMode(QuoteMode.ALL).build();
        List<String> csvStrings = new ArrayList<>();

        Page tabulaPage = extractor.extract(page + 1);
        List<Table> tables = sea.extract(tabulaPage);

        for (Table table : tables) {
            StringWriter sw = new StringWriter();
            FlexibleCSVWriter csvWriter = new FlexibleCSVWriter(format);
            csvWriter.write(sw, Collections.singletonList(table));
            csvStrings.add(sw.toString());
        }

        return csvStrings;
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
