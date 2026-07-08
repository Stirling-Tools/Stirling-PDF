package stirling.software.proprietary.policy.input;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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
 * Reads input files from a directory; each ready file is its own unit of work so one failure does
 * not affect the others.
 *
 * <p>Mode option: "consume" (default) tracks each file in place so each version runs once;
 * "snapshot" reads statelessly, so every run sees the full set. "recursive" descends into
 * subdirectories (hidden ones are skipped). "identity" picks the version signature: "stat"
 * (size+mtime, default) or "hash" (content hash - robust against mtime-preserving copies, at the
 * cost of reading every candidate file each sweep). Readiness is checked first so files mid-write
 * are skipped. Hidden files, and the legacy {@code .stirling} work directory, are never picked up.
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
            log.debug("Folder input dir does not exist: {}", inputDir);
            return List.of();
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
            String signature;
            try {
                signature = signatureOf(file, config);
            } catch (IOException e) {
                log.debug("Could not read {} for its signature: {}", file, e.getMessage());
                continue; // vanished or unreadable mid-sweep; the next sweep sees the truth
            }
            if (!ctx.claim(identity, signature)) {
                continue; // in flight, already settled at this version, or lost the race
            }
            work.add(
                    new ResolvedInput(
                            PolicyInputs.of(List.of(fileResource(file))),
                            success ->
                                    ctx.settle(
                                            identity,
                                            settleSignature(file, config, signature),
                                            success)));
        }
        return work;
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
        // Hidden subtrees (including the legacy .stirling work dir) are skipped wholesale;
        // symlinked directories are not followed.
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

    private static String signatureOf(Path file, FolderConfig config) throws IOException {
        return config.hashIdentity()
                ? FolderIdentities.hashSignature(file)
                : FolderIdentities.statSignature(file);
    }

    /**
     * The signature to settle at: re-read so an in-place overwrite settles at the version this run
     * produced rather than the one it consumed. Falls back to the claim-time signature when the
     * file is gone (its row is presence-cleaned at the next full sweep anyway).
     */
    private static String settleSignature(Path file, FolderConfig config, String claimSignature) {
        try {
            return signatureOf(file, config);
        } catch (IOException e) {
            return claimSignature;
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
