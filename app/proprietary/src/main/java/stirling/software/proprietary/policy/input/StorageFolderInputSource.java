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
import stirling.software.proprietary.storage.model.FilePurpose;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

/**
 * Reads input files from a folder in app storage — the input side of a processing folder. Each
 * stored file is claimed through the ledger at its current content version ({@code updatedAt} +
 * size): unchanged files never rerun, re-uploaded or edited ones run again, nothing is deleted. An
 * in-place output bumps that version, and the completion hook settles the ledger at the post-run
 * version so the next sweep does not re-ingest the run's own output.
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

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean supports(InputSpec spec) {
        return spec != null && TYPE.equals(spec.type());
    }

    /** Fails fast at save time: storage must be on and the folder must exist. */
    @Override
    public void validate(InputSpec spec) {
        if (!applicationProperties.getSecurity().isEnableLogin()
                || !applicationProperties.getStorage().isEnabled()) {
            throw new IllegalArgumentException("file storage is not enabled on this server");
        }
        if (!folderRepository.existsById(folderId(spec))) {
            throw new IllegalArgumentException(
                    "unknown storage folder: " + spec.options().get("folderId"));
        }
    }

    @Override
    public List<ResolvedInput> resolve(InputSpec spec, ResolveContext ctx) throws IOException {
        UUID folderId = folderId(spec);
        List<StoredFile> files =
                storedFileRepository.findAllByFolderId(folderId).stream()
                        .filter(StorageFolderInputSource::ingestible)
                        .toList();

        ctx.reportPresent(files.stream().map(StorageFolderInputSource::identity).toList());

        List<ResolvedInput> work = new ArrayList<>();
        for (StoredFile file : files) {
            String identity = identity(file);
            String gate = gate(file);
            // The hash tier turns metadata-only gate bumps (a folder move, a rename) into a gate
            // refresh instead of a reprocess; only genuinely new content runs again.
            if (!ctx.claim(
                    identity,
                    gate,
                    () -> StorageFileIdentities.contentHash(storageProvider, file))) {
                continue;
            }
            Long fileId = file.getId();
            work.add(
                    new ResolvedInput(
                            PolicyInputs.of(List.of(new StoredFileResource(storageProvider, file))),
                            identity,
                            success ->
                                    settleAtCurrentVersion(ctx, fileId, identity, gate, success)));
        }
        return work;
    }

    /**
     * Settle at the file's post-run version, not the claimed one — an in-place output bumped {@code
     * updatedAt}, and the old gate would read it as a fresh edit. A file deleted mid-run settles at
     * the claimed gate; presence cleanup prunes its row.
     */
    private void settleAtCurrentVersion(
            ResolveContext ctx, Long fileId, String identity, String claimedGate, boolean success) {
        StoredFile current = storedFileRepository.findById(fileId).orElse(null);
        if (current == null) {
            ctx.settle(identity, claimedGate, null, success);
            return;
        }
        // Settle with the content hash so a later metadata-only bump (move/rename) refreshes the
        // gate instead of reprocessing. Hash failures fall back to gate-only semantics.
        String finalContentHash = null;
        try {
            finalContentHash = StorageFileIdentities.contentHash(storageProvider, current);
        } catch (RuntimeException e) {
            log.debug("Could not hash {} at settle: {}", identity, e.getMessage());
        }
        ctx.settle(identity, gate(current), finalContentHash, success);
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
     * Streams the stored blob on demand, presenting the user-visible filename. Content is not
     * version-pinned: a concurrent replace is reconciled by the gate on the next sweep.
     */
    private static final class StoredFileResource extends AbstractResource
            implements StoredFileBacked {

        private final StorageProvider storageProvider;
        private final Long fileId;
        private final String storageKey;
        private final String filename;
        private final long sizeBytes;

        private StoredFileResource(StorageProvider storageProvider, StoredFile file) {
            this.storageProvider = storageProvider;
            this.fileId = file.getId();
            this.storageKey = file.getStorageKey();
            this.filename = file.getOriginalFilename();
            this.sizeBytes = file.getSizeBytes();
        }

        @Override
        public Long storedFileId() {
            return fileId;
        }

        @Override
        public InputStream getInputStream() throws IOException {
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
