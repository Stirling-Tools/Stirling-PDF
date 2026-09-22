package stirling.software.proprietary.policy.input;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.Optional;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.ledger.FolderIdentities;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;

/**
 * Resolves a folder ledger identity (a path on the operator's disk) back to its file. Containment
 * is the point: only inside a directory this policy watches and the guard permits, else nothing.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FolderDocuments {

    private final SourceStore sourceStore;
    private final FolderAccessGuard accessGuard;

    /**
     * The regular file {@code identity} names within one of {@code policy}'s folder inputs, or
     * empty. Never throws: every refusal is the same empty answer, so nothing probes the disk.
     */
    public Optional<Path> locate(Policy policy, String identity) {
        if (identity == null || identity.isBlank()) {
            return Optional.empty();
        }
        Path file;
        try {
            // Canonicalised like the watched root, or a symlinked root would never contain its own
            // files. Resolving the last link too judges a planted link by where it actually points.
            file = Path.of(identity).toRealPath();
        } catch (InvalidPathException | IOException gone) {
            return Optional.empty();
        }
        if (!Files.isRegularFile(file)) {
            return Optional.empty();
        }
        for (String sourceId : policy.sourceIds()) {
            Optional<Path> root = watchedRoot(sourceId);
            // Compared after normalisation, so `..` cannot walk out of the folder it was in.
            if (root.isPresent() && file.startsWith(root.get()) && !hiddenUnder(root.get(), file)) {
                return Optional.of(file);
            }
        }
        log.debug("Identity from policy {} names no file in a folder it watches", policy.id());
        return Optional.empty();
    }

    /**
     * The canonical directory a folder source watches; empty if not a folder, gone, or no longer
     * permitted. Skipped, not thrown: the policy's other inputs may hold the file.
     */
    private Optional<Path> watchedRoot(String sourceId) {
        Source source = sourceStore.get(sourceId).orElse(null);
        if (source == null || !FolderAccessGuard.FOLDER_TYPE.equals(source.type())) {
            return Optional.empty();
        }
        try {
            Path directory =
                    accessGuard.requirePermitted(
                            FolderInputSource.FolderConfig.from(source.options()).directory());
            return Optional.of(FolderIdentities.canonicalDir(directory));
        } catch (IOException | RuntimeException refused) {
            log.debug(
                    "Source {} is not a readable folder right now: {}",
                    sourceId,
                    refused.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Whether the file is in a hidden part of the folder, home of the {@code .stirling} workspace:
     * an archived original must not be addressable, or a fix could hit the copy kept to undo one.
     */
    private static boolean hiddenUnder(Path root, Path file) {
        for (Path part : root.relativize(file)) {
            if (part.toString().startsWith(".")) {
                return true;
            }
        }
        return false;
    }
}
