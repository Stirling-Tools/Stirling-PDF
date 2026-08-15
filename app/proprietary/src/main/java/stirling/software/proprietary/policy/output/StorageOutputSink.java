package stirling.software.proprietary.policy.output;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.input.StoredFileBacked;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.ledger.StorageFileIdentities;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.Folder;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.storage.service.FileStorageService;

/**
 * Writes a run's outputs back into app storage — the output side of a processing folder. Two modes,
 * chosen per policy via {@code mode}:
 *
 * <ul>
 *   <li>{@code new_version} (default): the single output replaces the input file's content in
 *       place, under the input's own name. The producing source settles the ledger at the bumped
 *       version, so the folder does not re-ingest the run's own output.
 *   <li>{@code new_file}: each output is stored as a new file and placed in the folder given by
 *       {@code folderId} (default: the input file's folder). The file is stored unplaced first and
 *       recorded in the processed-file ledger before it becomes visible in the folder, so a sweep
 *       can never claim the producing policy's own output.
 * </ul>
 *
 * <p>Ownership follows the input: outputs are stored as the input file's owner, within their quota.
 * A run fed from outside storage — a directory on disk — has no such anchor, so it is stored as the
 * owner of the {@code folderId} its outputs are placed in, and must name one.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StorageOutputSink implements PolicyOutputSink {

    static final String TYPE = "storage";
    static final String MODE_OPTION = "mode";
    static final String FOLDER_OPTION = "folderId";
    static final String NEW_VERSION = "new_version";
    static final String NEW_FILE = "new_file";

    private final StoredFileRepository storedFileRepository;
    private final FolderRepository folderRepository;
    private final FileStorageService fileStorageService;
    private final ProcessedLedger processedLedger;
    private final StorageProvider storageProvider;
    private final ApplicationProperties applicationProperties;

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
        if (!applicationProperties.getSecurity().isEnableLogin()
                || !applicationProperties.getStorage().isEnabled()) {
            throw new IllegalArgumentException("file storage is not enabled on this server");
        }
        String mode = modeOf(spec);
        if (!NEW_VERSION.equals(mode) && !NEW_FILE.equals(mode)) {
            throw new IllegalArgumentException("unknown storage output mode: " + mode);
        }
        UUID folderId = folderIdOf(spec);
        if (folderId != null && !folderRepository.existsById(folderId)) {
            throw new IllegalArgumentException("unknown storage folder: " + folderId);
        }
    }

    @Override
    public List<ResultFile> deliver(
            OutputDelivery delivery, List<Resource> outputs, OutputSpec spec) throws IOException {
        StoredFile origin = originOf(delivery);
        UUID folderId = folderIdOf(spec);
        User owner = ownerFor(origin, folderId);
        List<ResultFile> results = new ArrayList<>();

        // Replacing in place needs a stored row to replace, which a run fed from disk has not got.
        boolean replaceInPlace =
                origin != null && NEW_VERSION.equals(modeOf(spec)) && outputs.size() == 1;
        for (int i = 0; i < outputs.size(); i++) {
            Resource output = outputs.get(i);
            StoredFile stored;
            if (replaceInPlace) {
                // The output takes the input's place — same row, same name, new content, and
                // replaceFile keeps the row in whatever folder the user put it in.
                stored =
                        fileStorageService.replaceFile(
                                origin.getOwner(),
                                origin,
                                new ResourceMultipartFile(output, origin.getOriginalFilename()));
            } else {
                stored = storeIntoFolder(delivery, output, i, owner, origin, folderId);
            }
            results.add(
                    ResultFile.builder()
                            .fileId(String.valueOf(stored.getId()))
                            .fileName(stored.getOriginalFilename())
                            .contentType(stored.getContentType())
                            .fileSize(stored.getSizeBytes())
                            .build());
            log.debug(
                    "Wrote policy run {} output to stored file {}",
                    delivery.runId(),
                    stored.getId());
        }
        return results;
    }

    /**
     * Store first (unplaced — invisible to any folder sweep), record the ledger row, then place
     * into the folder. The row therefore exists before the file is discoverable, mirroring the disk
     * folder sink's stage-record-rename order.
     */
    private StoredFile storeIntoFolder(
            OutputDelivery delivery,
            Resource output,
            int index,
            User owner,
            StoredFile origin,
            UUID folderId)
            throws IOException {
        String name = OutputNames.safeName(output.getFilename(), index);
        StoredFile stored =
                fileStorageService.storeFile(owner, new ResourceMultipartFile(output, name));
        // Read the origin's placement as a plain id: it is detached here, so touching its lazy
        // folder association would fail.
        UUID targetFolder = folderId;
        if (targetFolder == null && origin != null) {
            targetFolder = storedFileRepository.findFolderIdByFileId(origin.getId()).orElse(null);
        }
        if (targetFolder == null) {
            return stored;
        }
        if (delivery.policyId() != null) {
            // The placement save below bumps updatedAt past this gate; the content hash is what
            // lets the next sweep read that bump as "already processed" rather than fresh work.
            processedLedger.recordOutput(
                    delivery.policyId(),
                    StorageFileIdentities.identity(stored),
                    StorageFileIdentities.gate(stored),
                    StorageFileIdentities.contentHash(storageProvider, stored));
        }
        stored.setFolder(folderRepository.getReferenceById(targetFolder));
        return storedFileRepository.save(stored);
    }

    /**
     * The stored file the run's primary input came from, or null when the input came from outside
     * storage (a directory on disk). Storage outputs anchor to it whenever it exists.
     */
    private StoredFile originOf(OutputDelivery delivery) {
        return delivery.inputs().primary().stream()
                .filter(StoredFileBacked.class::isInstance)
                .map(resource -> ((StoredFileBacked) resource).storedFileId())
                .flatMap(id -> storedFileRepository.findById(id).stream())
                .findFirst()
                .orElse(null);
    }

    /**
     * Who the outputs are stored as, and therefore whose quota they count against. A storage-backed
     * run follows its input's owner. A run fed from disk has nobody to follow, so it takes the
     * owner of the folder it is writing into — which is why such a policy must name one.
     */
    private User ownerFor(StoredFile origin, UUID folderId) {
        if (origin != null) {
            return origin.getOwner();
        }
        if (folderId == null) {
            throw new IllegalStateException(
                    "storage output from a non-storage input needs a folderId to anchor ownership");
        }
        return folderRepository
                .findById(folderId)
                .map(Folder::getOwner)
                .orElseThrow(
                        () -> new IllegalStateException("unknown storage folder: " + folderId));
    }

    private static String modeOf(OutputSpec spec) {
        Object mode = spec.options().get(MODE_OPTION);
        return mode == null || String.valueOf(mode).isBlank() ? NEW_VERSION : String.valueOf(mode);
    }

    private static UUID folderIdOf(OutputSpec spec) {
        Object raw = spec.options().get(FOLDER_OPTION);
        if (raw == null || String.valueOf(raw).isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(String.valueOf(raw));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("invalid storage output folderId: " + raw, e);
        }
    }

    /** Streams a run output into the storage service's upload seam without buffering it. */
    private record ResourceMultipartFile(Resource resource, String filename)
            implements MultipartFile {

        @Override
        public String getName() {
            return "file";
        }

        @Override
        public String getOriginalFilename() {
            return filename;
        }

        @Override
        public String getContentType() {
            return MediaTypeFactory.getMediaType(filename)
                    .orElse(MediaType.APPLICATION_OCTET_STREAM)
                    .toString();
        }

        @Override
        public boolean isEmpty() {
            return getSize() == 0;
        }

        @Override
        public long getSize() {
            try {
                return resource.contentLength();
            } catch (IOException e) {
                return -1;
            }
        }

        @Override
        public byte[] getBytes() throws IOException {
            try (InputStream is = resource.getInputStream()) {
                return is.readAllBytes();
            }
        }

        @Override
        public InputStream getInputStream() throws IOException {
            return resource.getInputStream();
        }

        @Override
        public void transferTo(java.io.File dest) throws IOException {
            try (InputStream is = resource.getInputStream()) {
                java.nio.file.Files.copy(
                        is, dest.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
        }
    }
}
