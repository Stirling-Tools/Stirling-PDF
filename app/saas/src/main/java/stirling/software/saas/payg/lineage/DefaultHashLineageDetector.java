package stirling.software.saas.payg.lineage;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.model.ArtifactKind;

/**
 * Default detector. Composes signatures from every registered {@link LineageSignatureExtractor}
 * (currently just SHA-256 byte hash; future PDF-aware extractors are drop-in additions) and
 * delegates lookup + persistence to a {@link JobLineageStore}.
 *
 * <p>Future: when the per-team {@code wallet_policy.auto_group_strategy} lookup lands (alongside
 * the wallet policy service), {@link #detect} will short-circuit to {@code Optional.empty()} when
 * the team has explicitly opted out of auto-grouping. Not in this PR — the wiring slot is the first
 * line of {@code detect}.
 */
@Slf4j
@Component
public class DefaultHashLineageDetector implements HashLineageDetector {

    private final List<LineageSignatureExtractor> extractors;
    private final JobLineageStore store;
    private final Duration workflowWindow;

    public DefaultHashLineageDetector(
            List<LineageSignatureExtractor> extractors,
            JobLineageStore store,
            @Value("${payg.lineage.workflow-window:PT5M}") Duration workflowWindow) {
        if (Objects.requireNonNull(extractors, "extractors").isEmpty()) {
            throw new IllegalStateException(
                    "DefaultHashLineageDetector requires at least one LineageSignatureExtractor"
                            + " bean — none registered.");
        }
        this.extractors = List.copyOf(extractors);
        this.store = Objects.requireNonNull(store, "store");
        this.workflowWindow = Objects.requireNonNull(workflowWindow, "workflowWindow");
    }

    @Override
    public Optional<LineageMatch> detect(Long userId, Path inputFile) throws IOException {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(inputFile, "inputFile");

        Set<LineageSignature> signatures = extractAll(inputFile);
        if (signatures.isEmpty()) {
            // No extractor produced anything for this content. Treat as no-match.
            log.debug("No signatures extracted from {}; lineage check returns empty.", inputFile);
            return Optional.empty();
        }

        return store.findOpenJobForSignatures(userId, signatures, workflowWindow);
    }

    @Override
    public void record(UUID jobId, Path file, ArtifactKind kind) throws IOException {
        Objects.requireNonNull(jobId, "jobId");
        Objects.requireNonNull(file, "file");
        Objects.requireNonNull(kind, "kind");

        Set<LineageSignature> signatures = extractAll(file);
        if (signatures.isEmpty()) {
            log.debug(
                    "No signatures extracted from {} for job {} ({}); nothing recorded.",
                    file,
                    jobId,
                    kind);
            return;
        }
        store.record(jobId, signatures, kind);
    }

    private Set<LineageSignature> extractAll(Path file) throws IOException {
        Set<LineageSignature> union = new HashSet<>();
        for (LineageSignatureExtractor extractor : extractors) {
            try {
                union.addAll(extractor.extract(file));
            } catch (IOException e) {
                // A single extractor failing (e.g. PDF-aware extractor on a malformed PDF) must
                // not block the byte-hash extractor from contributing. Log and continue.
                log.debug(
                        "Extractor '{}' failed on {} ({}); continuing with other extractors.",
                        extractor.name(),
                        file,
                        e.getMessage());
            }
        }
        return union;
    }
}
