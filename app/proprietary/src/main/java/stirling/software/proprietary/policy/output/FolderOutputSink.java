package stirling.software.proprietary.policy.output;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.billing.ContentHasher;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.ledger.FolderIdentities;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.OutputSpec;

/**
 * Writes a run's outputs to the {@code directory} given in the {@link OutputSpec}. Each output is
 * staged under a hidden {@code .stirling/tmp} dir, recorded in the processed-file ledger, then
 * atomically renamed into place, so the producing policy's row exists before the file is
 * discoverable and half-written outputs are never visible. Returned {@link ResultFile}s carry a
 * synthetic id since the deliverable is the file on disk, not a {@code FileStorage} entry.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class FolderOutputSink implements PolicyOutputSink {

    static final String TYPE = FolderAccessGuard.FOLDER_TYPE;
    static final String DIRECTORY_OPTION = "directory";

    // Staging entries are renamed away within one delivery; anything older is a crash leftover.
    private static final Duration STALE_TMP_AGE = Duration.ofDays(1);

    private final FolderAccessGuard accessGuard;
    private final ProcessedLedger processedLedger;

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean supports(OutputSpec spec) {
        return spec != null && TYPE.equals(spec.type());
    }

    @Override
    public void validate(OutputSpec spec) {
        accessGuard.requirePermitted(directoryOf(spec));
    }

    @Override
    public List<ResultFile> deliver(
            OutputDelivery delivery, List<Resource> outputs, OutputSpec spec) throws IOException {
        Path targetDir = accessGuard.requirePermitted(directoryOf(spec));
        Files.createDirectories(targetDir);
        Path canonicalDir = FolderIdentities.canonicalDir(targetDir);
        Path tmpDir = canonicalDir.resolve(".stirling").resolve("tmp");
        Files.createDirectories(tmpDir);
        sweepStaleTmp(tmpDir);

        List<ResultFile> results = new ArrayList<>();
        for (int i = 0; i < outputs.size(); i++) {
            Resource resource = outputs.get(i);
            String name = OutputNames.safeName(resource.getFilename(), i);
            Path staged = tmpDir.resolve(UUID.randomUUID().toString());
            String contentHash = stage(resource, staged, delivery.policyId() != null);
            long size = Files.size(staged);
            // Size and mtime survive the rename.
            String gate = FolderIdentities.statGate(staged);
            Path target = moveIntoPlace(delivery, canonicalDir, name, staged, gate, contentHash);
            String contentType =
                    MediaTypeFactory.getMediaType(name)
                            .orElse(MediaType.APPLICATION_OCTET_STREAM)
                            .toString();
            results.add(
                    ResultFile.builder()
                            .fileId(UUID.randomUUID().toString())
                            .fileName(target.toString())
                            .contentType(contentType)
                            .fileSize(size)
                            .build());
            log.debug("Wrote policy run {} output to {}", delivery.runId(), target);
        }
        return results;
    }

    /**
     * Stream the output to its staging path. For a recorded delivery (stored policy) the content
     * hash is digested in the same pass, so the ledger gets both version tiers without re-reading a
     * possibly huge output; ad-hoc runs record nothing and skip the digest entirely.
     */
    private static String stage(Resource resource, Path staged, boolean hashed) throws IOException {
        if (!hashed) {
            try (InputStream is = resource.getInputStream()) {
                Files.copy(is, staged);
            }
            return null;
        }
        MessageDigest digest = ContentHasher.newSha256();
        try (InputStream is = resource.getInputStream();
                DigestOutputStream out =
                        new DigestOutputStream(Files.newOutputStream(staged), digest)) {
            is.transferTo(out);
        }
        return ContentHasher.toHex(digest.digest());
    }

    /**
     * The ledger row must exist before the file is visible at its final path, or a sweep could
     * claim the producing policy's own output in the gap. Losing the chosen name to a concurrent
     * writer forgets the just-recorded row - whatever file actually owns that name must stay
     * claimable at any version - then re-picks.
     */
    private Path moveIntoPlace(
            OutputDelivery delivery,
            Path dir,
            String name,
            Path staged,
            String gate,
            String contentHash)
            throws IOException {
        while (true) {
            Path target = uniqueTarget(dir, name);
            if (delivery.policyId() != null) {
                processedLedger.recordOutput(
                        delivery.policyId(), target.toString(), gate, contentHash);
            }
            try {
                Files.move(staged, target, StandardCopyOption.ATOMIC_MOVE);
                return target;
            } catch (FileAlreadyExistsException raced) {
                if (delivery.policyId() != null) {
                    processedLedger.forgetOutput(delivery.policyId(), target.toString(), gate);
                }
                log.debug("Output name {} taken concurrently; re-picking", target);
            }
        }
    }

    /** Best-effort removal of staging leftovers from crashed deliveries. */
    private static void sweepStaleTmp(Path tmpDir) {
        Instant cutoff = Instant.now().minus(STALE_TMP_AGE);
        try (Stream<Path> entries = Files.list(tmpDir)) {
            entries.filter(Files::isRegularFile)
                    .filter(
                            entry -> {
                                try {
                                    return Files.getLastModifiedTime(entry)
                                            .toInstant()
                                            .isBefore(cutoff);
                                } catch (IOException e) {
                                    return false;
                                }
                            })
                    .forEach(
                            entry -> {
                                try {
                                    Files.deleteIfExists(entry);
                                } catch (IOException e) {
                                    log.debug(
                                            "Could not remove stale staging file {}: {}",
                                            entry,
                                            e.getMessage());
                                }
                            });
        } catch (IOException e) {
            log.debug("Could not sweep staging dir {}: {}", tmpDir, e.getMessage());
        }
    }

    private static Path directoryOf(OutputSpec spec) {
        Object directory = spec.options().get(DIRECTORY_OPTION);
        if (directory == null || directory.toString().isBlank()) {
            throw new IllegalArgumentException(
                    "folder output requires a '" + DIRECTORY_OPTION + "' option");
        }
        return Path.of(directory.toString());
    }

    // Non-colliding path, appending " (n)" before the extension.
    private static Path uniqueTarget(Path dir, String filename) {
        Path candidate = dir.resolve(filename);
        if (!Files.exists(candidate)) {
            return candidate;
        }
        for (int n = 1; ; n++) {
            Path next = dir.resolve(OutputNames.numbered(filename, n));
            if (!Files.exists(next)) {
                return next;
            }
        }
    }
}
