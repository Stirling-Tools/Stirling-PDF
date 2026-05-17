package stirling.software.proprietary.storage.service;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.Folder;
import stirling.software.proprietary.storage.model.api.CreateFolderRequest;
import stirling.software.proprietary.storage.model.api.FolderResponse;
import stirling.software.proprietary.storage.model.api.UpdateFolderRequest;
import stirling.software.proprietary.storage.repository.FolderRepository;

/**
 * Phase A folder operations. Each call is scoped to the authenticated user — folders are private to
 * their owner. Folder-level sharing is a Phase 3 feature.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class FolderService {

    /**
     * Hard cap on folders per user. Beyond this {@link #createFolder} rejects with 409 — guards
     * against per-account folder-explosion DoS and bounds the in-memory subtree walk in {@link
     * #deleteFolder}.
     */
    private static final long MAX_FOLDERS_PER_USER = 5_000L;

    private final FolderRepository folderRepository;

    /** List every folder owned by the current user, alphabetical. */
    @Transactional(readOnly = true)
    public List<FolderResponse> listFolders() {
        User user = requireAuthenticatedUser();
        return folderRepository.findAllByOwnerOrderByName(user).stream()
                .map(FolderResponse::from)
                .toList();
    }

    @Transactional
    public FolderResponse createFolder(CreateFolderRequest request) {
        User user = requireAuthenticatedUser();
        Folder parent = resolveParent(request.getParentFolderId(), user, null);

        UUID id = request.getId() != null ? request.getId() : UUID.randomUUID();

        // Idempotent: if this user already owns a folder with the supplied id, return it
        // unchanged. Single fetch (the previous code did findByIdAndOwner twice with a race
        // window between the two lookups).
        java.util.Optional<Folder> existing = folderRepository.findByIdAndOwner(id, user);
        if (existing.isPresent()) {
            return FolderResponse.from(existing.get());
        }

        // The id is a global primary key. If the id exists for a *different* user, surfacing 500
        // with a constraint-violation stack trace leaks far too much; convert to 409 Conflict so
        // the caller can pick a fresh id.
        if (folderRepository.existsById(id)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "A folder with this id already exists; choose a different id");
        }

        if (folderRepository.countByOwner(user) >= MAX_FOLDERS_PER_USER) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Folder limit reached (max " + MAX_FOLDERS_PER_USER + " per user)");
        }

        Folder folder = new Folder();
        folder.setId(id);
        folder.setOwner(user);
        folder.setParent(parent);
        folder.setName(request.getName().trim());
        folder.setColor(request.getColor());
        folder.setIcon(request.getIcon());

        // saveAndFlush forces the INSERT now so @CreationTimestamp populates
        // createdAt/updatedAt before we build the response. Plain save defers
        // the SQL until @Transactional commit, and the response would carry
        // null timestamps that the frontend trust-boundary parser then rejects.
        Folder saved = folderRepository.saveAndFlush(folder);
        log.info(
                "Folder created: user={} id={} parent={}",
                user.getId(),
                saved.getId(),
                parent == null ? "root" : parent.getId());
        return FolderResponse.from(saved);
    }

    @Transactional
    public FolderResponse updateFolder(UUID id, UpdateFolderRequest request) {
        User user = requireAuthenticatedUser();
        Folder folder = requireOwnedFolder(id, user);

        if (request.getName() != null) {
            String trimmed = request.getName().trim();
            if (trimmed.isEmpty()) {
                // Bean validation should already catch this via @Pattern, but be explicit so
                // an empty-after-trim payload reaches the user as a 400 instead of being
                // silently dropped.
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Folder name cannot be blank");
            }
            folder.setName(trimmed);
        }

        if (request.shouldReparent()) {
            Folder newParent = resolveParent(request.getParentFolderId(), user, folder.getId());
            folder.setParent(newParent);
        }

        if (request.getColor() != null) {
            folder.setColor(request.getColor().isEmpty() ? null : request.getColor());
        }

        if (request.getIcon() != null) {
            folder.setIcon(request.getIcon().isEmpty() ? null : request.getIcon());
        }

        // saveAndFlush so @UpdateTimestamp populates updatedAt before the
        // response is serialized (same reason as createFolder).
        return FolderResponse.from(folderRepository.saveAndFlush(folder));
    }

    /**
     * Recursive delete. Returns the ids of every folder that was removed so the caller can purge
     * them from its local cache. Files inside those folders are detached (folder_id set to null) —
     * never deleted.
     */
    @Transactional
    public List<UUID> deleteFolder(UUID id) {
        User user = requireAuthenticatedUser();
        Folder folder = requireOwnedFolder(id, user);

        // Build the parent → children map once. Project to id-only via the
        // existing entity list (Hibernate already has the column loaded —
        // we only access f.getParent().getId() on a managed proxy, which
        // does NOT initialize the proxy because Hibernate has the FK
        // value cached at the join column).
        Map<UUID, List<UUID>> childIdsByParent = new HashMap<>();
        for (Folder f : folderRepository.findAllByOwnerOrderByName(user)) {
            UUID parentId = f.getParent() == null ? null : f.getParent().getId();
            childIdsByParent.computeIfAbsent(parentId, k -> new ArrayList<>()).add(f.getId());
        }

        // Iterative subtree collection — prior recursive form blew the JVM
        // stack on deeply nested chains a malicious caller could create.
        List<UUID> removed = new ArrayList<>();
        Set<UUID> seen = new HashSet<>();
        Deque<UUID> stack = new ArrayDeque<>();
        stack.push(folder.getId());
        while (!stack.isEmpty()) {
            UUID cur = stack.pop();
            if (!seen.add(cur)) continue;
            removed.add(cur);
            List<UUID> children = childIdsByParent.get(cur);
            if (children != null) {
                for (UUID childId : children) stack.push(childId);
            }
        }

        if (!removed.isEmpty()) {
            folderRepository.clearFolderForFiles(removed);
            folderRepository.deleteAllByIdInBatch(removed);
            log.info(
                    "Folder subtree deleted: user={} root={} count={}",
                    user.getId(),
                    folder.getId(),
                    removed.size());
        }

        return removed;
    }

    // ─── helpers ────────────────────────────────────────────────────

    private Folder requireOwnedFolder(UUID id, User user) {
        return folderRepository
                .findByIdAndOwner(id, user)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND,
                                        "Folder not found or not owned by current user"));
    }

    private Folder resolveParent(UUID parentId, User user, UUID forbidId) {
        if (parentId == null) return null;
        if (forbidId != null && parentId.equals(forbidId)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "A folder cannot be its own parent");
        }
        Folder parent =
                folderRepository
                        .findByIdAndOwner(parentId, user)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "Parent folder does not exist or is not owned by you"));
        if (forbidId != null && wouldCreateCycle(parent, forbidId)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Cannot move a folder inside one of its descendants");
        }
        return parent;
    }

    private boolean wouldCreateCycle(Folder candidate, UUID forbidId) {
        Folder cursor = candidate;
        Set<UUID> seen = new HashSet<>();
        while (cursor != null) {
            if (cursor.getId().equals(forbidId)) return true;
            if (!seen.add(cursor.getId())) return true; // broken graph
            cursor = cursor.getParent();
        }
        return false;
    }

    private User requireAuthenticatedUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof User user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }
        return user;
    }
}
