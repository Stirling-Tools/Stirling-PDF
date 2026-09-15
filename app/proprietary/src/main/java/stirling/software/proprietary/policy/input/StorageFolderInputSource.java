package stirling.software.proprietary.policy.input;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.core.io.AbstractResource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.ledger.StorageFileIdentities;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.model.FilePurpose;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

/**
 * Reads input files from a folder in app storage — the input side of a processing folder. Each
 * stored file is claimed through the ledger at its current content version ({@code updatedAt} +
 * size): unchanged files never rerun, re-uploaded or edited ones run again, nothing is deleted. An
 * in-place output records its committed version on the input, so completion never marks a
 * concurrent user upload as processed.
 *
 * <p>Options: {@code folderId} — the storage folder's UUID.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StorageFolderInputSource implements InputSource {

    private static final String TYPE = "storage-folder";

    private final StoredFileRepository storedFileRepository;
    private final FolderRepository folderRepository;
    private final StorageProvider storageProvider;
    private final ApplicationProperties applicationProperties;
    private final UserService userService;

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean supports(InputSpec spec) {
        return spec != null && TYPE.equals(spec.type());
    }

    /** Private folders must belong to the authenticated caller configuring the source. */
    @Override
    public void validate(InputSpec spec) {
        requireStorageEnabled();
        requireOwnedFolder(folderId(spec), requireOwner(userService.getCurrentUsername()));
    }

    private void requireStorageEnabled() {
        if (!applicationProperties.getSecurity().isEnableLogin()
                || !applicationProperties.getStorage().isEnabled()) {
            throw new IllegalArgumentException("file storage is not enabled on this server");
        }
    }

    @Override
    public List<ResolvedInput> resolve(InputSpec spec, ResolveContext ctx) throws IOException {
        return resolveForOwner(spec, ctx, userService.getCurrentUsername());
    }

    @Override
    public List<ResolvedInput> resolve(Source source, ResolveContext ctx, String policyOwner)
            throws IOException {
        if (policyOwner == null || !policyOwner.equals(source.owner())) {
            throw new IllegalArgumentException("Storage folder sources are private to their owner");
        }
        return resolveForOwner(source.toInputSpec(), ctx, policyOwner);
    }

    private List<ResolvedInput> resolveForOwner(InputSpec spec, ResolveContext ctx, String username)
            throws IOException {
        requireStorageEnabled();
        User owner = requireOwner(username);
        UUID folderId = folderId(spec);
        requireOwnedFolder(folderId, owner);
        List<StoredFile> files =
                storedFileRepository.findAllByFolderIdAndOwner(folderId, owner).stream()
                        .filter(StorageFolderInputSource::ingestible)
                        .toList();

        ctx.reportPresent(files.stream().map(StorageFolderInputSource::identity).toList());

        List<ResolvedInput> work = new ArrayList<>();
        for (StoredFile file : files) {
            String identity = identity(file);
            String gate = gate(file);
            StoredFileResource resource = new StoredFileResource(file, folderId, owner);
            // The hash tier turns metadata-only gate bumps (a folder move, a rename) into a gate
            // refresh instead of a reprocess; only genuinely new content runs again.
            if (!ctx.claim(
                    identity,
                    gate,
                    () -> {
                        String hash = ownedContentHash(file, folderId, owner);
                        resource.rememberInputHash(hash);
                        return hash;
                    })) {
                continue;
            }
            work.add(
                    new ResolvedInput(
                            PolicyInputs.of(List.of(resource)),
                            identity,
                            success -> resource.settle(ctx, identity, success)));
        }
        return work;
    }

    private User requireOwner(String username) {
        if (username == null || username.isBlank()) {
            throw new IllegalArgumentException(
                    "Storage folder input requires an authenticated owner");
        }
        return userService
                .findByUsername(username)
                .filter(user -> user.getId() != null)
                .orElseThrow(
                        () -> new IllegalArgumentException("Storage folder owner is unavailable"));
    }

    private void requireOwnedFolder(UUID folderId, User owner) {
        if (folderRepository.findByIdAndOwner(folderId, owner).isEmpty()) {
            throw new IllegalArgumentException("Unknown or inaccessible storage folder");
        }
    }

    private void requireOwnedFile(Long fileId, UUID folderId, User owner) {
        // Reads and completion hashing can outlive discovery. These queries deliberately recheck
        // both owners each time so a cached permission cannot survive an ownership change.
        requireOwnedFolder(folderId, owner);
        if (storedFileRepository
                .findByIdAndOwner(fileId, owner)
                .filter(StorageFolderInputSource::ingestible)
                .isEmpty()) {
            throw new IllegalArgumentException("Unknown or inaccessible stored file");
        }
    }

    private String ownedContentHash(StoredFile file, UUID folderId, User owner) {
        requireOwnedFile(file.getId(), folderId, owner);
        return StorageFileIdentities.contentHash(storageProvider, file);
    }

    /** Only generic user files are processed — purpose-bound artifacts belong to their feature. */
    private static boolean ingestible(StoredFile file) {
        return file.getPurpose() == null || file.getPurpose() == FilePurpose.GENERIC;
    }

    private static String identity(StoredFile file) {
        return StorageFileIdentities.identity(file);
    }

    private static String gate(StoredFile file) {
        return StorageFileIdentities.gate(file);
    }

    private static UUID folderId(InputSpec spec) {
        Object raw = spec.options().get("folderId");
        try {
            return UUID.fromString(String.valueOf(raw));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("storage-folder source needs a folderId", e);
        }
    }

    /**
     * Streams the stored blob on demand, presenting the user-visible filename, and carries the
     * exact revision this run is allowed to replace or mark processed. Reads recheck ownership
     * because they can outlive discovery.
     */
    private final class StoredFileResource extends AbstractResource implements StoredFileBacked {

        private final UUID folderId;
        private final User owner;
        private final Long fileId;
        private final String storageKey;
        private final String filename;
        private final long sizeBytes;
        private final long version;

        // Set at claim, replaced when an in-place output commits, and read by whichever thread
        // completes the run. The two writes cannot overlap: delivery follows discovery.
        private volatile CompletionVersion completed;

        private record CompletionVersion(String gate, String contentHash) {}

        private StoredFileResource(StoredFile file, UUID folderId, User owner) {
            this.folderId = folderId;
            this.owner = owner;
            this.fileId = file.getId();
            this.storageKey = file.getStorageKey();
            this.filename = file.getOriginalFilename();
            this.sizeBytes = file.getSizeBytes();
            this.version = file.contentVersionOrZero();
            this.completed = new CompletionVersion(gate(file), null);
        }

        @Override
        public Long storedFileId() {
            return fileId;
        }

        @Override
        public long storedFileVersion() {
            return version;
        }

        @Override
        public void recordReplacement(String gate, String contentHash) {
            completed = new CompletionVersion(gate, contentHash);
        }

        private void rememberInputHash(String contentHash) {
            completed = new CompletionVersion(completed.gate(), contentHash);
        }

        private void settle(ResolveContext ctx, String identity, boolean success) {
            CompletionVersion result = completed;
            ctx.settle(identity, result.gate(), result.contentHash(), success);
        }

        @Override
        public InputStream getInputStream() throws IOException {
            requireOwnedFile(fileId, folderId, owner);
            return storageProvider.load(storageKey).getInputStream();
        }

        /** Listed just now; readers get a precise error from {@link #getInputStream} instead. */
        @Override
        public boolean exists() {
            return true;
        }

        @Override
        public long contentLength() {
            return sizeBytes;
        }

        @Override
        public String getFilename() {
            return filename;
        }

        @Override
        public String getDescription() {
            return "stored file " + filename + " (" + storageKey + ")";
        }
    }
}
