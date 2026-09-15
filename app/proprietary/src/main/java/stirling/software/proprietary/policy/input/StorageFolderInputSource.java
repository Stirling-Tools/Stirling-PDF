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
            StoredFileResource resource = new StoredFileResource(storageProvider, file);
            if (!ctx.claim(
                    identity,
                    gate,
                    () -> {
                        String hash = StorageFileIdentities.contentHash(storageProvider, file);
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

    /** Captures input identity and the exact version this run may replace or mark processed. */
    private static final class StoredFileResource extends AbstractResource
            implements StoredFileBacked {

        private final StorageProvider storageProvider;
        private final Long fileId;
        private final String storageKey;
        private final String filename;
        private final long sizeBytes;
        private final long version;
        private volatile CompletionVersion completed;

        private record CompletionVersion(String gate, String contentHash) {}

        private StoredFileResource(StorageProvider storageProvider, StoredFile file) {
            this.storageProvider = storageProvider;
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
