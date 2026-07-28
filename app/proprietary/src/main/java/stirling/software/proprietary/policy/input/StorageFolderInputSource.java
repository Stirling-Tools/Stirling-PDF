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
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.storage.model.FilePurpose;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

/**
 * Reads input files from a folder in the app's file storage — the input side of a processing
 * folder. Each stored file is one unit of work, claimed through the ledger at its current content
 * version ({@code updatedAt} + size), so an unchanged file never reruns while a re-uploaded or
 * edited one is picked up again. Files are tracked in place and never deleted.
 *
 * <p>A run whose output replaces the file's content in place bumps that version; the completion
 * hook settles the ledger at the file's post-run version so the next sweep does not re-ingest the
 * run's own output. Purpose-specific files (signing artifacts etc.) are never picked up.
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
            if (!ctx.claim(identity, gate, null)) {
                continue;
            }
            Long fileId = file.getId();
            work.add(
                    new ResolvedInput(
                            PolicyInputs.of(List.of(new StoredFileResource(storageProvider, file))),
                            success ->
                                    settleAtCurrentVersion(ctx, fileId, identity, gate, success)));
        }
        return work;
    }

    /**
     * Settle at whatever version the file carries after the run, not the one that was claimed: an
     * in-place output bumped {@code updatedAt}, and settling at the old gate would make the next
     * sweep read the run's own output as a fresh edit. A file deleted mid-run settles at the
     * claimed gate; presence cleanup prunes its row.
     */
    private void settleAtCurrentVersion(
            ResolveContext ctx, Long fileId, String identity, String claimedGate, boolean success) {
        String finalGate =
                storedFileRepository
                        .findById(fileId)
                        .map(StorageFolderInputSource::gate)
                        .orElse(claimedGate);
        ctx.settle(identity, finalGate, null, success);
    }

    /** Only generic user files are processed — purpose-bound artifacts belong to their feature. */
    private static boolean ingestible(StoredFile file) {
        return file.getPurpose() == null || file.getPurpose() == FilePurpose.GENERIC;
    }

    private static String identity(StoredFile file) {
        return "storage:" + file.getId();
    }

    private static String gate(StoredFile file) {
        return file.getUpdatedAt() + ":" + file.getSizeBytes();
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
     * Streams the stored blob on demand through the storage provider, presenting the user-visible
     * filename (the storage key is opaque). Content is not version-pinned: a concurrent in-place
     * replace is read as-is and reconciled by the gate on the next sweep.
     */
    private static final class StoredFileResource extends AbstractResource {

        private final StorageProvider storageProvider;
        private final String storageKey;
        private final String filename;
        private final long sizeBytes;

        private StoredFileResource(StorageProvider storageProvider, StoredFile file) {
            this.storageProvider = storageProvider;
            this.storageKey = file.getStorageKey();
            this.filename = file.getOriginalFilename();
            this.sizeBytes = file.getSizeBytes();
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
