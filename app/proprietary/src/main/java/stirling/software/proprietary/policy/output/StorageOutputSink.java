package stirling.software.proprietary.policy.output;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.input.StoredFileBacked;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.ledger.StorageFileIdentities;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.model.Folder;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.storage.service.FileStorageService;

/**
 * Writes a run's outputs back into app storage, the output side of a processing folder. {@code
 * mode} picks: {@code new_version} (default) replaces the input file's content in place under its
 * own name, settling the ledger at the bumped version; {@code new_file} stores each output as a new
 * file in {@code folderId} (default: the input's folder), recorded in the ledger before it becomes
 * visible so a sweep never claims the policy's own output. The engine supplies the document owner;
 * existing files and destination folders must belong to that user before anything is written.
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
    private final UserService userService;

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
        if (folderId == null) {
            return;
        }
        // Match what delivery will demand of this folder. Accepting one the caller does not own
        // would save a policy that then fails on every run with nothing to point the user at.
        User caller =
                userService
                        .findByUsername(userService.getCurrentUsername())
                        .orElseThrow(
                                () ->
                                        new IllegalArgumentException(
                                                "storage output requires an authenticated owner"));
        if (folderRepository.findByIdAndOwner(folderId, caller).isEmpty()) {
            throw new IllegalArgumentException("unknown or inaccessible storage folder");
        }
    }

    @Override
    public List<ResultFile> deliver(
            OutputDelivery delivery, List<Resource> outputs, OutputSpec spec) throws IOException {
        StoredFileBacked input = storedInputOf(delivery);
        StoredFile origin = originOf(input, spec);
        UUID folderId = folderIdOf(spec);
        User owner = ownerFor(delivery, origin, folderId);
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
                                owner,
                                origin,
                                new ResourceMultipartFile(output, origin.getOriginalFilename()),
                                null,
                                null,
                                input.storedFileVersion());
                input.recordReplacement(
                        StorageFileIdentities.gate(stored),
                        contentHashOrNull(stored),
                        stored.contentVersionOrZero());
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
     * Store first (unplaced — invisible to sweeps), record the ledger row, then place into the
     * folder: the row exists before the file is discoverable.
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

    private StoredFileBacked storedInputOf(OutputDelivery delivery) {
        return delivery.inputs().primary().stream()
                .filter(StoredFileBacked.class::isInstance)
                .map(StoredFileBacked.class::cast)
                .findFirst()
                .orElse(null);
    }

    /**
     * The stored row the run's primary input came from; null when the input came from disk or when
     * the row is gone and this mode does not write back to it.
     *
     * <p>Replacing in place needs the row: without it the delivery would fall through to storing a
     * new file, resurrecting the very input the user deleted mid-run. Writing a separate file
     * resurrects nothing, so a deleted input there costs the run nothing and the output still
     * lands.
     */
    private StoredFile originOf(StoredFileBacked input, OutputSpec spec) {
        if (input == null) {
            return null;
        }
        Optional<StoredFile> origin = storedFileRepository.findById(input.storedFileId());
        if (origin.isEmpty() && NEW_VERSION.equals(modeOf(spec))) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "The input file was removed during processing");
        }
        return origin.orElse(null);
    }

    private String contentHashOrNull(StoredFile file) {
        try {
            return StorageFileIdentities.contentHash(storageProvider, file);
        } catch (RuntimeException e) {
            // The replacement already committed; a concurrent upload can remove its blob.
            log.debug("Could not hash stored output {}", file.getId(), e);
            return null;
        }
    }

    private User ownerFor(OutputDelivery delivery, StoredFile origin, UUID folderId) {
        String username = delivery.fileOwner();
        if (username == null || username.isBlank()) {
            throw new IllegalStateException("Storage output requires a document owner");
        }
        User owner =
                userService
                        .findByUsername(username)
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "The document owner is unavailable"));
        if (origin != null && !ownedBy(origin.getOwner(), owner)) {
            throw new IllegalStateException("The input file does not belong to the document owner");
        }
        if (folderId != null) {
            Folder folder =
                    folderRepository
                            .findById(folderId)
                            .orElseThrow(
                                    () ->
                                            new IllegalStateException(
                                                    "Unknown storage folder: " + folderId));
            if (!ownedBy(folder.getOwner(), owner)) {
                throw new IllegalStateException(
                        "The output folder does not belong to the document owner");
            }
        } else if (origin == null) {
            throw new IllegalStateException(
                    "Storage output without a stored input requires a folder");
        }
        return owner;
    }

    private static boolean ownedBy(User actual, User expected) {
        return actual != null
                && expected.getId() != null
                && expected.getId().equals(actual.getId());
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
