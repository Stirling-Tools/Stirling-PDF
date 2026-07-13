package stirling.software.proprietary.policy.input;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.stream.Stream;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.FileReadinessChecker;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.ledger.FolderIdentities;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.PolicyInputs;

/**
 * Reads input files from a directory; each ready file is its own unit of work, claimed through the
 * {@link ResolveContext} ledger rather than moved aside, so nothing accumulates in a work
 * directory. Options: "mode" is "consume" (default: a processed file is removed once every policy
 * that claimed it has settled successfully and it is still the version that ran; failures stay in
 * place and are not retried until they change) or "snapshot" (stateless, every run sees the full
 * set); "recursive" descends into subdirectories; "identity" is "stat" (default, any size/mtime
 * change is a new version) or "hash" (content-verified, so a touch does not reprocess). Hidden
 * files and directories, including the legacy {@code .stirling} work dir, are never picked up, and
 * files mid-write are skipped by the readiness check.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class FolderInputSource implements InputSource {

    private static final String TYPE = FolderAccessGuard.FOLDER_TYPE;

    private final FileReadinessChecker readinessChecker;
    private final FolderAccessGuard accessGuard;

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean supports(InputSpec spec) {
        return spec != null && TYPE.equals(spec.type());
    }

    @Override
    public void validate(InputSpec spec) {
        accessGuard.requirePermitted(FolderConfig.from(spec.options()).directory());
    }

    @Override
    public List<Path> watchTargets(InputSpec spec) {
        return List.of(FolderConfig.from(spec.options()).directory());
    }

    @Override
    public List<ResolvedInput> resolve(InputSpec spec, ResolveContext ctx) throws IOException {
        FolderConfig config = FolderConfig.from(spec.options());
        Path inputDir = accessGuard.requirePermitted(config.directory());
        if (!Files.isDirectory(inputDir)) {
            // Fail rather than return empty: an unmounted drive must read as "could not list",
            // which vetoes the sweep's presence cleanup, not as "verifiably no files", which
            // would wipe the policy's history and reprocess everything on remount.
            throw new NoSuchFileException(
                    inputDir.toString(), null, "input directory does not exist");
        }
        Path canonicalDir = FolderIdentities.canonicalDir(inputDir);
        List<Path> present = listFiles(inputDir, config.recursive());

        if (config.snapshot()) {
            List<ResolvedInput> work = new ArrayList<>();
            for (Path file : present) {
                if (readinessChecker.isReady(file)) {
                    work.add(ResolvedInput.of(PolicyInputs.of(List.of(fileResource(file)))));
                }
            }
            return work;
        }

        ctx.reportPresent(
                present.stream()
                        .map(file -> FolderIdentities.identity(canonicalDir, inputDir, file))
                        .toList());

        List<ResolvedInput> work = new ArrayList<>();
        for (Path file : present) {
            if (!readinessChecker.isReady(file)) {
                continue;
            }
            String identity = FolderIdentities.identity(canonicalDir, inputDir, file);
            MemoizedContentHash contentHash =
                    config.hashIdentity() ? new MemoizedContentHash(file) : null;
            String gate;
            boolean claimed;
            try {
                gate = FolderIdentities.statGate(file);
                claimed = ctx.claim(identity, gate, contentHash);
            } catch (IOException | UncheckedIOException e) {
                log.debug("Could not read {} for its version: {}", file, e.getMessage());
                continue; // vanished or unreadable mid-sweep; the next sweep sees the truth
            }
            if (!claimed) {
                continue;
            }
            work.add(
                    new ResolvedInput(
                            PolicyInputs.of(List.of(fileResource(file))),
                            success ->
                                    completeConsumed(
                                            ctx, identity, file, gate, contentHash, success)));
        }
        return work;
    }

    /**
     * Settle at the version this run claimed - never a re-read, so a file replaced mid-run reads as
     * a new unclaimed version next sweep instead of being marked processed. Then remove the input
     * only when it is still the processed version (a mid-run replacement must survive) and every
     * policy that claimed it has settled DONE, so co-watching policies all read the original and
     * one failure parks the file for everyone. A failed run settles ERROR and never deletes; the
     * DONE row of a file that could not be deleted still stops reprocessing.
     */
    private static void completeConsumed(
            ResolveContext ctx,
            String identity,
            Path file,
            String claimGate,
            MemoizedContentHash contentHash,
            boolean success) {
        ctx.settle(identity, claimGate, claimedHash(file, claimGate, contentHash), success);
        if (!success) {
            return;
        }
        try {
            if (FolderIdentities.statGate(file).equals(claimGate) && ctx.allSettledDone(identity)) {
                Files.deleteIfExists(file);
            }
        } catch (NoSuchFileException alreadyGone) {
            // Removed by the user or a co-watching policy's own consensus delete: nothing to do.
        } catch (IOException e) {
            log.warn("Could not remove consumed input {}: {}", file, e.getMessage());
        }
    }

    /**
     * The claimed version's content hash: the value computed during the claim when the ledger
     * consulted the verifier, else computed now while the file is still at the claimed gate (so the
     * hash describes what actually ran), else null. Always null in stat mode.
     */
    private static String claimedHash(Path file, String claimGate, MemoizedContentHash hash) {
        if (hash == null) {
            return null;
        }
        String computed = hash.valueIfComputed();
        if (computed != null) {
            return computed;
        }
        try {
            if (FolderIdentities.statGate(file).equals(claimGate)) {
                return hash.get();
            }
        } catch (IOException | UncheckedIOException e) {
            log.debug("Could not hash {} at settle: {}", file, e.getMessage());
        }
        return null;
    }

    /** Lazy verification tier: invoked at most once by the ledger, retained for the settle. */
    private static final class MemoizedContentHash implements Supplier<String> {

        private final Path file;
        private volatile String value;

        private MemoizedContentHash(Path file) {
            this.file = file;
        }

        @Override
        public String get() {
            if (value == null) {
                try {
                    value = FolderIdentities.contentHash(file);
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            }
            return value;
        }

        String valueIfComputed() {
            return value;
        }
    }

    /** Every non-hidden regular file in the source, readable or not. */
    private static List<Path> listFiles(Path inputDir, boolean recursive) throws IOException {
        List<Path> files = new ArrayList<>();
        if (!recursive) {
            try (Stream<Path> entries = Files.list(inputDir)) {
                entries.filter(Files::isRegularFile)
                        .filter(file -> !hidden(file))
                        .forEach(files::add);
            }
            return files;
        }
        // Hidden subtrees are pruned wholesale; symlinked directories are not followed.
        Files.walkFileTree(
                inputDir,
                new SimpleFileVisitor<>() {
                    @Override
                    public FileVisitResult preVisitDirectory(
                            Path dir, BasicFileAttributes attributes) {
                        if (!dir.equals(inputDir) && hidden(dir)) {
                            return FileVisitResult.SKIP_SUBTREE;
                        }
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) {
                        if (attributes.isRegularFile() && !hidden(file)) {
                            files.add(file);
                        }
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult visitFileFailed(Path file, IOException e) {
                        log.debug("Skipping unreadable entry {}: {}", file, e.getMessage());
                        return FileVisitResult.CONTINUE;
                    }
                });
        return files;
    }

    private static boolean hidden(Path path) {
        Path name = path.getFileName();
        if (name != null && name.toString().startsWith(".")) {
            return true;
        }
        try {
            return Files.isHidden(path);
        } catch (IOException e) {
            return false;
        }
    }

    private static Resource fileResource(Path path) {
        String name = path.getFileName().toString();
        return new FileSystemResource(path.toFile()) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }

    record FolderConfig(Path directory, boolean snapshot, boolean recursive, boolean hashIdentity) {

        private static final String DIRECTORY_OPTION = "directory";
        private static final String MODE_OPTION = "mode";
        private static final String MODE_SNAPSHOT = "snapshot";
        private static final String RECURSIVE_OPTION = "recursive";
        private static final String IDENTITY_OPTION = "identity";
        private static final String IDENTITY_STAT = "stat";
        private static final String IDENTITY_HASH = "hash";

        static FolderConfig from(Map<String, Object> options) {
            Object directory = options.get(DIRECTORY_OPTION);
            if (directory == null || directory.toString().isBlank()) {
                throw new IllegalArgumentException("folder input requires a 'directory' option");
            }
            Object mode = options.get(MODE_OPTION);
            boolean snapshot = mode != null && MODE_SNAPSHOT.equals(mode.toString());
            Object recursive = options.get(RECURSIVE_OPTION);
            boolean recurse = recursive != null && Boolean.parseBoolean(recursive.toString());
            Object identity = options.get(IDENTITY_OPTION);
            boolean hash = identity != null && IDENTITY_HASH.equals(identity.toString());
            if (identity != null
                    && !IDENTITY_STAT.equals(identity.toString())
                    && !IDENTITY_HASH.equals(identity.toString())) {
                throw new IllegalArgumentException(
                        "folder input 'identity' must be 'stat' or 'hash'");
            }
            return new FolderConfig(Path.of(directory.toString()), snapshot, recurse, hash);
        }
    }
}
