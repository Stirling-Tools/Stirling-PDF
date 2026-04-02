package stirling.software.SPDF.service;

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

import stirling.software.SPDF.model.api.ai.AgentTurn;
import stirling.software.SPDF.model.api.ai.Evidence;
import stirling.software.SPDF.model.api.ai.Folio;
import stirling.software.SPDF.model.api.ai.FolioManifest;
import stirling.software.SPDF.model.api.ai.FolioType;
import stirling.software.SPDF.model.api.ai.Requisition;
import stirling.software.SPDF.model.api.ai.Verdict;
import stirling.software.SPDF.pdf.FlexibleCSVWriter;
import stirling.software.common.service.CustomPDFDocumentFactory;

import technology.tabula.ObjectExtractor;
import technology.tabula.Page;
import technology.tabula.Table;
import technology.tabula.extractors.SpreadsheetExtractionAlgorithm;

/**
 * The loop controller for the Ledger Audit negotiation.
 *
 * <p>Orchestrates the multi-round Java → Python protocol:
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
public class AuditOrchestrator {

    private static final int MAX_ROUNDS = 3;

    private final AiEngineClient engineClient;
    private final CustomPDFDocumentFactory pdfDocumentFactory;

    /**
     * Run a full audit against the supplied PDF file.
     *
     * @param pdfFile The uploaded PDF to audit.
     * @param tolerance Arithmetic tolerance — differences smaller than this are ignored.
     * @return The Auditor's final Verdict.
     */
    public Verdict audit(MultipartFile pdfFile, BigDecimal tolerance) throws Exception {
        String sessionId = UUID.randomUUID().toString();
        log.info(
                "[ledger] audit started session={} file={} tolerance={}",
                sessionId,
                pdfFile.getOriginalFilename(),
                tolerance);

        try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {
            // ---------------------------------------------------------------
            // Round 1: classify pages cheaply; send manifest; get requisition
            // ---------------------------------------------------------------
            List<FolioType> folioTypes = classifyPages(document);
            FolioManifest manifest =
                    new FolioManifest(sessionId, document.getNumberOfPages(), folioTypes, 1);

            Requisition requisition = engineClient.examine(manifest);
            log.info(
                    "[ledger] session={} requisition received: {}",
                    sessionId,
                    requisition.rationale());

            // ---------------------------------------------------------------
            // Rounds 2–MAX_ROUNDS: fulfil then deliberate.
            // The Auditor always returns a Verdict — the loop is a safeguard for
            // protocol compliance, not an expectation of multiple rounds.
            // ---------------------------------------------------------------
            for (int round = 2; round <= MAX_ROUNDS + 1; round++) {
                boolean isFinalRound = (round > MAX_ROUNDS);
                // Cap the round number sent to Python at MAX_ROUNDS — the Python model
                // validates le=3, so we must not send round=4 even on a forced final pass.
                int evidenceRound = Math.min(round, MAX_ROUNDS);

                Evidence evidence =
                        fulfil(document, sessionId, requisition, evidenceRound, isFinalRound);
                AgentTurn turn = engineClient.deliberate(evidence, tolerance);

                if (turn == null) {
                    log.error("[ledger] session={} null AgentTurn on round {}", sessionId, round);
                    throw new IllegalStateException(
                            "Ledger Auditor returned null on round " + round);
                }

                if (turn.isFinal()) {
                    Verdict verdict = turn.verdict();
                    log.info(
                            "[ledger] session={} verdict: {} errors, {} warnings, clean={}",
                            sessionId,
                            verdict.errorCount(),
                            verdict.warningCount(),
                            verdict.clean());
                    return verdict;
                }

                if (isFinalRound) {
                    log.warn(
                            "[ledger] session={} Auditor returned Requisition on final round — protocol violation",
                            sessionId);
                    throw new IllegalStateException(
                            "Ledger Auditor exceeded max rounds without verdict");
                }

                requisition = turn.requisition();
                log.info(
                        "[ledger] session={} round {} requisition: {}",
                        sessionId,
                        round,
                        requisition.rationale());
            }

            // Unreachable — loop always returns or throws
            throw new IllegalStateException("Audit loop exited without verdict");
        }
    }

    // -----------------------------------------------------------------------
    // Page classification
    // -----------------------------------------------------------------------

    /**
     * Classify every page cheaply using PDFBox character counts and page content analysis. No OCR
     * or Tabula — this must be fast enough not to block the first round.
     */
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

    /**
     * Fulfil a Requisition by extracting exactly the content Python asked for. Pages not mentioned
     * in the Requisition are not touched.
     */
    private Evidence fulfil(
            PDDocument document,
            String sessionId,
            Requisition requisition,
            int round,
            boolean finalRound)
            throws Exception {

        // Collect all pages mentioned in this requisition.
        List<Integer> allPages =
                union(requisition.needText(), requisition.needTables(), requisition.needOcr());
        List<Folio> folios = new ArrayList<>();
        List<Integer> unautablePages = new ArrayList<>();

        // Create a single ObjectExtractor for all table extractions in this round.
        // Must NOT be closed — closing it invalidates the PDDocument streams.
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
                // OCR is triggered via OCRmyPDF subprocess — not yet implemented in this
                // initial version. Track the page as unauditable so the Auditor can report
                // incomplete coverage rather than silently skipping the page.
                log.warn(
                        "[ledger] session={} OCR requested for page {} but not yet wired — marking unauditable",
                        sessionId,
                        page);
                unautablePages.add(page);
            }

            // Include a folio for any page that has at least text or table content,
            // even when OCR was unavailable for that page.
            if (text != null || tables != null) {
                folios.add(new Folio(page, text, tables, ocrText, null));
            }
        }

        log.info(
                "[ledger] session={} fulfilled round {} with {} folios, {} unauditable pages",
                sessionId,
                round,
                folios.size(),
                unautablePages.size());
        return new Evidence(sessionId, folios, round, finalRound, unautablePages);
    }

    /**
     * Extract plain text from a single page using PDFBox. Returns empty string rather than null so
     * the Auditor always has something to work with.
     */
    private String extractText(PDDocument document, int page) throws Exception {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setStartPage(page + 1); // PDFBox is 1-indexed
        stripper.setEndPage(page + 1);
        return stripper.getText(document).strip();
    }

    /**
     * Extract all tables from a single page using Tabula, returning one CSV string per table.
     * Returns an empty list if Tabula finds no tables.
     *
     * <p><b>Note:</b> The ObjectExtractor must NOT be closed here — closing it invalidates the
     * underlying PDDocument streams, breaking extraction for subsequent pages. The PDDocument
     * itself is closed by the caller in {@link #audit}.
     */
    private List<String> extractTables(ObjectExtractor extractor, int page) throws Exception {
        SpreadsheetExtractionAlgorithm sea = new SpreadsheetExtractionAlgorithm();
        CSVFormat format =
                CSVFormat.EXCEL.builder().setEscape('"').setQuoteMode(QuoteMode.ALL).build();
        List<String> csvStrings = new ArrayList<>();

        Page tabulaPage = extractor.extract(page + 1); // Tabula is 1-indexed
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
