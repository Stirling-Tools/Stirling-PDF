package stirling.software.saas.payg.lineage;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.saas.payg.job.JobArtifactHash;
import stirling.software.saas.payg.job.JobArtifactHash.JobArtifactHashId;
import stirling.software.saas.payg.model.ArtifactKind;
import stirling.software.saas.payg.model.JobStatus;
import stirling.software.saas.payg.repository.JobArtifactHashRepository;

/**
 * JPA-backed {@link JobLineageStore} against the {@code job_artifact_hash} table. The lookup runs
 * as a single joined query against {@code processing_job} so status + window filtering happens at
 * the database, not in-process.
 *
 * <p>Signatures are persisted using {@link LineageSignature#asStorageKey()} ({@code "type:value"})
 * so multiple signature types coexist on the same column without a schema change.
 */
@Component
@Profile("saas")
@RequiredArgsConstructor
public class JpaJobLineageStore implements JobLineageStore {

    private final JobArtifactHashRepository hashRepository;

    @Override
    @Transactional
    public void record(UUID jobId, Set<LineageSignature> signatures, ArtifactKind kind) {
        Objects.requireNonNull(jobId, "jobId");
        Objects.requireNonNull(signatures, "signatures");
        Objects.requireNonNull(kind, "kind");
        if (signatures.isEmpty()) {
            return;
        }
        // saveAll + @Transactional → one transaction, all-or-nothing. Without this, a multi-
        // signature record() could leave partial state if a save mid-way fails.
        List<JobArtifactHash> rows = new ArrayList<>(signatures.size());
        for (LineageSignature signature : signatures) {
            JobArtifactHash row = new JobArtifactHash();
            row.setId(new JobArtifactHashId(jobId, signature.asStorageKey(), kind));
            rows.add(row);
        }
        hashRepository.saveAll(rows);
    }

    @Override
    public Optional<LineageMatch> findOpenJobForSignatures(
            Long userId, Set<LineageSignature> candidates, Duration workflowWindow) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(candidates, "candidates");
        Objects.requireNonNull(workflowWindow, "workflowWindow");
        if (candidates.isEmpty()) {
            return Optional.empty();
        }

        List<String> storageKeys = candidates.stream().map(LineageSignature::asStorageKey).toList();
        LocalDateTime since = LocalDateTime.now().minus(workflowWindow);

        List<LineageMatch> matches =
                hashRepository.findOpenJobsForSignatures(
                        userId, JobStatus.OPEN, since, storageKeys, Limit.of(1));
        return matches.isEmpty() ? Optional.empty() : Optional.of(matches.get(0));
    }

    @Override
    @Transactional
    public int pruneOlderThan(Instant cutoff) {
        Objects.requireNonNull(cutoff, "cutoff");
        return hashRepository.deleteOlderThan(
                LocalDateTime.ofInstant(cutoff, ZoneId.systemDefault()));
    }
}
