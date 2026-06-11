package stirling.software.proprietary.policy.input;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.FileReadinessChecker;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.PolicyInputs;

/**
 * Reads input files from a directory. Each ready file becomes its own unit of work (one run per
 * file) so a failure on one file does not affect the others.
 *
 * <p>Two modes via the {@code mode} option:
 *
 * <ul>
 *   <li>{@code "consume"} (default) - claim each file by moving it into {@code
 *       .stirling/processing}, then route it to {@code .stirling/done} or {@code .stirling/error}
 *       when its run finishes. Each file is processed once; right for "process new arrivals" (and
 *       the basis of watched folders).
 *   <li>{@code "snapshot"} - read the directory's current files without moving them; every run sees
 *       the full set again. Right for "always regenerate from a fixed input set".
 * </ul>
 *
 * Readiness is checked first (via {@link FileReadinessChecker}) so files mid-write are skipped.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FolderInputSource implements InputSource {

    private static final String TYPE = FolderAccessGuard.FOLDER_TYPE;
    // Bookkeeping lives under one hidden namespace dir so the watched folder stays tidy.
    private static final String WORK_SUBDIR = ".stirling";
    private static final String PROCESSING_SUBDIR = "processing";
    private static final String DONE_SUBDIR = "done";
    private static final String ERROR_SUBDIR = "error";

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
    public List<ResolvedInput> resolve(InputSpec spec) throws IOException {
        FolderConfig config = FolderConfig.from(spec.options());
        Path inputDir = accessGuard.requirePermitted(config.directory());
        if (!Files.isDirectory(inputDir)) {
            log.debug("Folder input dir does not exist: {}", inputDir);
            return List.of();
        }

        List<Path> ready = new ArrayList<>();
        try (Stream<Path> entries = Files.list(inputDir)) {
            entries.filter(Files::isRegularFile)
                    .filter(readinessChecker::isReady)
                    .forEach(ready::add);
        }

        List<ResolvedInput> work = new ArrayList<>();
        for (Path file : ready) {
            if (config.snapshot()) {
                work.add(ResolvedInput.of(PolicyInputs.of(List.of(fileResource(file)))));
            } else {
                Path claimed = claim(inputDir, file);
                if (claimed == null) {
                    continue; // another sweep/process grabbed it
                }
                work.add(
                        new ResolvedInput(
                                PolicyInputs.of(List.of(fileResource(claimed))),
                                success -> route(inputDir, claimed, success)));
            }
        }
        return work;
    }

    private Path claim(Path inputDir, Path file) {
        try {
            Path processingDir = workDir(inputDir, PROCESSING_SUBDIR);
            Files.createDirectories(processingDir);
            Path claimed = uniqueTarget(processingDir, file.getFileName().toString());
            Files.move(file, claimed, StandardCopyOption.ATOMIC_MOVE);
            return claimed;
        } catch (IOException e) {
            log.debug("Could not claim {}: {}", file, e.getMessage());
            return null;
        }
    }

    private void route(Path inputDir, Path claimed, boolean success) {
        String subdir = success ? DONE_SUBDIR : ERROR_SUBDIR;
        try {
            Path destDir = workDir(inputDir, subdir);
            Files.createDirectories(destDir);
            Files.move(
                    claimed,
                    uniqueTarget(destDir, claimed.getFileName().toString()),
                    StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            log.warn(
                    "Could not move processed input {} to {}: {}", claimed, subdir, e.getMessage());
        }
    }

    /** A bookkeeping subdirectory under the watched folder's {@code .stirling} namespace. */
    private static Path workDir(Path inputDir, String subdir) {
        return inputDir.resolve(WORK_SUBDIR).resolve(subdir);
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

    private static Path uniqueTarget(Path dir, String filename) {
        Path candidate = dir.resolve(filename);
        if (!Files.exists(candidate)) {
            return candidate;
        }
        int dot = filename.lastIndexOf('.');
        String base = dot < 0 ? filename : filename.substring(0, dot);
        String ext = dot < 0 ? "" : filename.substring(dot);
        for (int n = 1; ; n++) {
            Path next = dir.resolve(base + " (" + n + ")" + ext);
            if (!Files.exists(next)) {
                return next;
            }
        }
    }

    /** The typed, validated form of a folder source's options: the directory and dedup mode. */
    record FolderConfig(Path directory, boolean snapshot) {

        private static final String DIRECTORY_OPTION = "directory";
        private static final String MODE_OPTION = "mode";
        private static final String MODE_SNAPSHOT = "snapshot";

        static FolderConfig from(Map<String, Object> options) {
            Object directory = options.get(DIRECTORY_OPTION);
            if (directory == null || directory.toString().isBlank()) {
                throw new IllegalArgumentException("folder input requires a 'directory' option");
            }
            Object mode = options.get(MODE_OPTION);
            boolean snapshot = mode != null && MODE_SNAPSHOT.equals(mode.toString());
            return new FolderConfig(Path.of(directory.toString()), snapshot);
        }
    }
}
