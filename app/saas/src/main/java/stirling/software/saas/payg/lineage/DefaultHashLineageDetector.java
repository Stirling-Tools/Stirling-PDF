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
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.model.ArtifactKind;

/**
 * Default detector. Composes signatures from every registered {@link LineageSignatureExtractor}
 * (currently just SHA-256 byte hash; future PDF-aware extractors are drop-in additions) and
 * delegates lookup + persistence to a {@link JobLineageStore}.
 */
@Slf4j
@Component
@Profile("saas")
public class DefaultHashLineageDetector implements HashLineageDetector {

    private final List<LineageSignatureExtractor> extractors;
    private final JobLineageStore store;
    private final Duration workflowWindow;

    public DefaultHashLineageDetector(
            List<LineageSignatureExtractor> extractors,
            JobLineageStore store,
            @Value("${payg.lineage.workflow-window:PT5M}") Duration workflowWindow) {
        Objects.requireNonNull(extractors, "extractors");
        Objects.requireNonNull(store, "store");
        Objects.requireNonNull(workflowWindow, "workflowWindow");
        if (extractors.isEmpty()) {
            throw new IllegalStateException(
                    "DefaultHashLineageDetector requires at least one LineageSignatureExtractor"
                            + " bean — none registered.");
        }
        if (workflowWindow.isNegative() || workflowWindow.isZero()) {
            // A non-positive window would mean "since = now + |window|", so the > comparison
            // only matches jobs in the future — i.e. nothing matches, silently. Fail loud
            // instead.
            throw new IllegalArgumentException(
                    "payg.lineage.workflow-window must be positive, got " + workflowWindow);
        }
        this.extractors = List.copyOf(extractors);
        this.store = store;
        this.workflowWindow = workflowWindow;
    }

    @Override
    public Optional<LineageMatch> detect(Long userId, Path inputFile) throws IOException {
        Objects.requireNonNull(inputFile, "inputFile");
        return detect(userId, extractSignatures(inputFile));
    }

    @Override
    public Optional<LineageMatch> detect(Long userId, Set<LineageSignature> signatures) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(signatures, "signatures");
        if (signatures.isEmpty()) {
            // No extractor produced anything for this content. Treat as no-match.
            return Optional.empty();
        }
        return store.findOpenJobForSignatures(userId, signatures, workflowWindow);
    }

    @Override
    public void record(UUID jobId, Path file, ArtifactKind kind) throws IOException {
        Objects.requireNonNull(file, "file");
        record(jobId, extractSignatures(file), kind);
    }

    @Override
    public void record(UUID jobId, Set<LineageSignature> signatures, ArtifactKind kind) {
        Objects.requireNonNull(jobId, "jobId");
        Objects.requireNonNull(signatures, "signatures");
        Objects.requireNonNull(kind, "kind");
        if (signatures.isEmpty()) {
            log.debug("No signatures to record for job {} ({}); skipping.", jobId, kind);
            return;
        }
        store.record(jobId, signatures, kind);
    }

    @Override
    public Set<LineageSignature> extractSignatures(Path file) {
        Objects.requireNonNull(file, "file");
        return extractAll(file);
    }

    private Set<LineageSignature> extractAll(Path file) {
        Set<LineageSignature> union = new HashSet<>();
        for (LineageSignatureExtractor extractor : extractors) {
            try {
                union.addAll(extractor.extract(file));
            } catch (IOException e) {
                // A single extractor failing on file IO / format parse (e.g. PDF-aware extractor
                // on a malformed PDF) must not block other extractors from contributing. Log and
                // continue. RuntimeExceptions deliberately propagate — they signal bugs we want
                // to surface, not "expected" extractor-doesn't-fit-this-content failures.
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
