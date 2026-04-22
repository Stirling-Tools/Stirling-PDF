package stirling.software.proprietary.service;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.WatchFolder;
import stirling.software.proprietary.model.WatchFolderFile;
import stirling.software.proprietary.model.WatchFolderRun;
import stirling.software.proprietary.model.watchfolder.FolderScope;
import stirling.software.proprietary.repository.WatchFolderFileRepository;
import stirling.software.proprietary.repository.WatchFolderRepository;
import stirling.software.proprietary.repository.WatchFolderRunRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

@Slf4j
@Service
@RequiredArgsConstructor
public class WatchFolderService {

    private final WatchFolderRepository folderRepo;
    private final WatchFolderFileRepository fileRepo;
    private final WatchFolderRunRepository runRepo;
    private final UserRepository userRepo;
    private final UserService userService;

    // ── Folder CRUD ────────────────────────────────────────────────────────

    /** Get all folders the current user can see (their own + organisation). */
    @Transactional(readOnly = true)
    public List<WatchFolder> listFolders() {
        User user = currentUser();
        if (user == null) return List.of();
        return folderRepo.findVisibleToUser(user.getId(), FolderScope.ORGANISATION);
    }

    @Transactional(readOnly = true)
    public Optional<WatchFolder> getFolder(String id) {
        return folderRepo.findById(id).filter(this::canRead);
    }

    @Transactional
    public WatchFolder createFolder(WatchFolder folder) {
        // Reject id collisions explicitly rather than letting JpaRepository.save() silently merge
        // into someone else's folder row. This closes a takeover vector where a caller POSTs a
        // payload whose id matches an existing admin-owned ORGANISATION folder.
        if (folder.getId() != null && folderRepo.existsById(folder.getId())) {
            throw new DataIntegrityViolationException(
                    "Watch folder with id '" + folder.getId() + "' already exists");
        }

        if (FolderScope.ORGANISATION.equals(folder.getScope())) {
            requireAdmin();
            folder.setOwner(null);
        } else {
            // Force any missing / non-ORGANISATION scope to PERSONAL owned by the caller. This also
            // prevents a non-admin client from "promoting" by omitting scope and relying on the
            // default — createFolder is the server's chance to establish ownership.
            folder.setScope(FolderScope.PERSONAL);
            folder.setOwner(requireCurrentUser());
        }
        return folderRepo.save(folder);
    }

    @Transactional
    public WatchFolder updateFolder(String id, WatchFolder updates) {
        WatchFolder existing =
                folderRepo
                        .findById(id)
                        .orElseThrow(
                                () -> new IllegalArgumentException("Folder not found: " + id));
        requireWriteAccess(existing);

        existing.setName(updates.getName());
        existing.setDescription(updates.getDescription());
        existing.setAutomationConfig(updates.getAutomationConfig());
        existing.setIcon(updates.getIcon());
        existing.setAccentColor(updates.getAccentColor());
        existing.setOrderIndex(updates.getOrderIndex());
        existing.setIsPaused(updates.getIsPaused());
        existing.setInputSource(updates.getInputSource());
        existing.setProcessingMode(updates.getProcessingMode());
        existing.setOutputMode(updates.getOutputMode());
        existing.setOutputName(updates.getOutputName());
        existing.setOutputNamePosition(updates.getOutputNamePosition());
        existing.setOutputTtlHours(updates.getOutputTtlHours());
        existing.setDeleteOutputOnDownload(updates.getDeleteOutputOnDownload());
        existing.setMaxRetries(updates.getMaxRetries());
        existing.setRetryDelayMinutes(updates.getRetryDelayMinutes());

        // Scope change: only admin can promote to organisation
        if (FolderScope.ORGANISATION.equals(updates.getScope())
                && !FolderScope.ORGANISATION.equals(existing.getScope())) {
            requireAdmin();
            existing.setScope(FolderScope.ORGANISATION);
            existing.setOwner(null);
        }

        return folderRepo.save(existing);
    }

    @Transactional
    public void deleteFolder(String id) {
        WatchFolder folder =
                folderRepo
                        .findById(id)
                        .orElseThrow(
                                () -> new IllegalArgumentException("Folder not found: " + id));
        requireWriteAccess(folder);

        // Don't rely on CascadeType.ALL to remove children one-row-at-a-time — for a folder with
        // tens of thousands of files and runs that loads every child into memory. Use the bulk
        // @Modifying queries instead, then remove the parent row.
        fileRepo.deleteAllByFolderId(id);
        runRepo.deleteAllByFolderId(id);
        folderRepo.deleteById(id);
    }

    // ── Folder files ───────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<WatchFolderFile> listFiles(String folderId) {
        requireReadAccess(folderId);
        return fileRepo.findByFolderIdOrderByAddedAtDesc(folderId);
    }

    /**
     * Create or update a file row keyed by {@code (folderId, fileId)}. Any client-supplied {@code
     * id} on the payload is discarded — otherwise an attacker could pass the primary key of a row
     * in a folder they don't own and have Hibernate re-parent it into their folder on save.
     *
     * <p>Idempotent under concurrent callers: if two requests for the same pair race past the
     * lookup, the DB's unique constraint fires on one, which is then retried through the merge
     * branch.
     */
    @Transactional
    public WatchFolderFile upsertFile(String folderId, WatchFolderFile file) {
        requireWriteAccess(folderId);
        WatchFolder folder = folderRepo.getReferenceById(folderId);

        // IMPORTANT: drop the client-supplied primary key. We identify existing rows by the
        // (folderId, fileId) unique pair, never by the numeric id from the JSON body.
        file.setId(null);
        file.setFolder(folder);

        if (file.getFileId() != null) {
            Optional<WatchFolderFile> existing =
                    fileRepo.findByFolderIdAndFileId(folderId, file.getFileId());
            if (existing.isPresent()) {
                return mergeFile(existing.get(), file);
            }
        }

        try {
            return fileRepo.save(file);
        } catch (DataIntegrityViolationException race) {
            // Another writer inserted the same (folderId, fileId) between our lookup and save.
            // Re-read and merge. If the row has vanished again (e.g. concurrent delete), let the
            // exception propagate as 409 Conflict.
            log.debug(
                    "upsertFile race for folder={} fileId={}; retrying via merge",
                    folderId,
                    file.getFileId());
            return fileRepo.findByFolderIdAndFileId(folderId, file.getFileId())
                    .map(existing -> mergeFile(existing, file))
                    .orElseThrow(() -> race);
        }
    }

    private WatchFolderFile mergeFile(WatchFolderFile existing, WatchFolderFile incoming) {
        existing.setStatus(incoming.getStatus());
        existing.setName(incoming.getName());
        existing.setErrorMessage(incoming.getErrorMessage());
        existing.setFailedAttempts(incoming.getFailedAttempts());
        existing.setOwnedByFolder(incoming.getOwnedByFolder());
        existing.setPendingOnServer(incoming.getPendingOnServer());
        existing.setDisplayFileIds(incoming.getDisplayFileIds());
        existing.setServerOutputFilenames(incoming.getServerOutputFilenames());
        existing.setProcessedAt(incoming.getProcessedAt());
        return fileRepo.save(existing);
    }

    @Transactional
    public void deleteFiles(String folderId) {
        requireWriteAccess(folderId);
        fileRepo.deleteAllByFolderId(folderId);
    }

    // ── Folder runs ────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<WatchFolderRun> listRuns(String folderId) {
        requireReadAccess(folderId);
        return runRepo.findByFolderIdOrderByProcessedAtDesc(folderId);
    }

    @Transactional
    public WatchFolderRun addRun(String folderId, WatchFolderRun run) {
        requireWriteAccess(folderId);
        WatchFolder folder = folderRepo.getReferenceById(folderId);
        // Discard any client-supplied primary key so we always INSERT — otherwise a caller could
        // UPDATE an existing run row in a different folder by guessing its id.
        run.setId(null);
        run.setFolder(folder);
        return runRepo.save(run);
    }

    @Transactional
    public List<WatchFolderRun> addRuns(String folderId, List<WatchFolderRun> runs) {
        requireWriteAccess(folderId);
        WatchFolder folder = folderRepo.getReferenceById(folderId);
        runs.stream()
                .filter(Objects::nonNull)
                .forEach(
                        r -> {
                            r.setId(null);
                            r.setFolder(folder);
                        });
        return runRepo.saveAll(runs);
    }

    // ── Auth helpers ───────────────────────────────────────────────────────

    private User currentUser() {
        String username = userService.getCurrentUsername();
        if (username == null) return null;
        return userRepo.findByUsernameIgnoreCase(username).orElse(null);
    }

    private User requireCurrentUser() {
        User user = currentUser();
        if (user == null) throw new AccessDeniedException("Authentication required");
        return user;
    }

    private void requireAdmin() {
        if (!userService.isCurrentUserAdmin()) {
            throw new AccessDeniedException("Admin access required");
        }
    }

    private boolean canRead(WatchFolder folder) {
        if (FolderScope.ORGANISATION.equals(folder.getScope())) return true;
        User user = currentUser();
        return user != null
                && folder.getOwner() != null
                && user.getId().equals(folder.getOwner().getId());
    }

    private void requireReadAccess(String folderId) {
        WatchFolder folder =
                folderRepo
                        .findById(folderId)
                        .orElseThrow(
                                () ->
                                        new IllegalArgumentException(
                                                "Folder not found: " + folderId));
        if (!canRead(folder)) {
            throw new AccessDeniedException("Access denied to folder: " + folderId);
        }
    }

    private void requireWriteAccess(WatchFolder folder) {
        if (FolderScope.ORGANISATION.equals(folder.getScope())) {
            requireAdmin();
        } else {
            User user = requireCurrentUser();
            if (folder.getOwner() == null || !user.getId().equals(folder.getOwner().getId())) {
                throw new AccessDeniedException("Access denied to folder: " + folder.getId());
            }
        }
    }

    private void requireWriteAccess(String folderId) {
        WatchFolder folder =
                folderRepo
                        .findById(folderId)
                        .orElseThrow(
                                () ->
                                        new IllegalArgumentException(
                                                "Folder not found: " + folderId));
        requireWriteAccess(folder);
    }
}
