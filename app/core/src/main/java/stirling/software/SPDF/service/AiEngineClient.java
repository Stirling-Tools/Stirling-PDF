package stirling.software.SPDF.service;

import java.math.BigDecimal;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.ai.AgentTurn;
import stirling.software.SPDF.model.api.ai.Evidence;
import stirling.software.SPDF.model.api.ai.FolioManifest;
import stirling.software.SPDF.model.api.ai.Requisition;

/**
 * Thin HTTP client for the Python Ledger Auditor engine.
 *
 * <p>Java is always the caller; Python never initiates connections back to Java.
 * The engine URL is configured via the {@code STIRLING_AI_ENGINE_URL} environment
 * variable, which defaults to {@code http://localhost:5001} for local development.
 *
 * <p>Two endpoints are called:
 * <ul>
 *   <li>{@code POST /api/ledger/examine}    — send a {@link FolioManifest}, receive a {@link Requisition}
 *   <li>{@code POST /api/ledger/deliberate} — send {@link Evidence}, receive an {@link AgentTurn}
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiEngineClient {

    @Qualifier("aiEngineRestTemplate")
    private final RestTemplate restTemplate;

    @Value("${STIRLING_AI_ENGINE_URL:http://localhost:5001}")
    private String engineBaseUrl;

    /**
     * Round 1: present the FolioManifest to the Examiner.
     * Returns the Requisition declaring what Java must extract.
     */
    public Requisition examine(FolioManifest manifest) {
        String url = engineBaseUrl.stripTrailing() + "/api/ledger/examine";
        log.info("[ledger] POST {} session={} round={}", url, manifest.sessionId(), manifest.round());

        ResponseEntity<Requisition> response =
                restTemplate.postForEntity(url, jsonEntity(manifest), Requisition.class);

        Requisition requisition = response.getBody();
        log.info(
                "[ledger] requisition session={} text={} tables={} ocr={}",
                manifest.sessionId(),
                requisition == null ? "null" : requisition.needText(),
                requisition == null ? "null" : requisition.needTables(),
                requisition == null ? "null" : requisition.needOcr());
        return requisition;
    }

    /**
     * Round 2: present fulfilled Evidence to the Auditor.
     * Returns an AgentTurn containing the Verdict — the Auditor always commits
     * after receiving its evidence.
     *
     * @param evidence  The fulfilled extraction results.
     * @param tolerance Arithmetic tolerance forwarded to the Python validator as a query param.
     */
    public AgentTurn deliberate(Evidence evidence, BigDecimal tolerance) {
        String url = UriComponentsBuilder
                .fromUriString(engineBaseUrl.stripTrailing() + "/api/ledger/deliberate")
                .queryParam("tolerance", tolerance.toPlainString())
                .toUriString();

        log.info(
                "[ledger] POST {} session={} round={} final={} tolerance={}",
                url,
                evidence.sessionId(),
                evidence.round(),
                evidence.finalRound(),
                tolerance);

        ResponseEntity<AgentTurn> response =
                restTemplate.postForEntity(url, jsonEntity(evidence), AgentTurn.class);

        AgentTurn turn = response.getBody();
        log.info(
                "[ledger] agent turn session={} final={}",
                evidence.sessionId(),
                turn == null ? "null" : turn.isFinal());
        return turn;
    }

    private HttpEntity<Object> jsonEntity(Object body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, headers);
    }
}
