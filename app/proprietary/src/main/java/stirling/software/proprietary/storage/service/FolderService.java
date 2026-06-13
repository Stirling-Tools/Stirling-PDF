package stirling.software.proprietary.storage.service;

import java.security.Principal;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import io.quarkus.security.identity.SecurityIdentity;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.PersistenceException;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.Folder;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.model.api.CreateFolderRequest;
import stirling.software.proprietary.storage.model.api.FolderResponse;
import stirling.software.proprietary.storage.model.api.UpdateFolderRequest;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

/**
 * Phase A folder operations. Each call is scoped to the authenticated user - folders are private to
 * their owner. Folder-level sharing is a Phase 3 feature.
 */
@ApplicationScoped
@RequiredArgsConstructor
@Slf4j
public class FolderService {

    /**
     * Hard cap on folders per user. Beyond this {@link #createFolder} rejects with 409 - guards
     * against per-account folder-explosion DoS and bounds the in-memory subtree walk in {@link
     * #deleteFolder}.
     */
    private static final long MAX_FOLDERS_PER_USER = 5_000L;

    /**
     * Hard cap on chain depth from the root to any folder. Bounds the lazy-proxy walk in {@link
     * #enforceDepthAndCycle} - otherwise a user could build a chain up to MAX_FOLDERS_PER_USER deep
     * and force one Hibernate SELECT per ancestor on every reparent (5,000+ SELECTs == seconds of
     * DB time per request, per-account weaponizable as DoS).
     */
    private static final int MAX_FOLDER_DEPTH = 64;

    /**
     * Hard cap on bulk-move payload size, mirroring the request-validation cap on {@code
     * FileStorageController.BulkMoveRequest.fileIds}. Re-asserted at the service layer because
     * controller-level @Valid bounds aren't enforced when the service is called directly (e.g. by
     * future internal callers or tests).
     */
    private static final int BULK_MOVE_MAX_FILES = 1000;

    private final FolderRepository folderRepository;
    private final StoredFileRepository storedFileRepository;
    private final ApplicationProperties applicationProperties;
    private final SecurityIdentity securityIdentity;

    /**
     * Gate every public method on storage being enabled, mirroring {@code
     * FileStorageService.ensureStorageEnabled}. Without this, folder CRUD still works when {@code
     * storage.enabled=false} or {@code security.enableLogin=false}, defeating the operator's intent
     * to disable storage end-to-end.
     */
    private void ensureStorageEnabled() {
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            throw new WebApplicationException(
                    "Storage requires login to be enabled", Response.Status.FORBIDDEN);
        }
        if (!applicationProperties.getStorage().isEnabled()) {
            throw new WebApplicationException("Storage is disabled", Response.Status.FORBIDDEN);
        }
    }

    /** List every folder owned by the current user, alphabetical. */
    // Spring @Transactional(readOnly = true) -> jakarta.transaction.Transactional. JTA's
    // @Transactional has no readOnly attribute; the read-only optimization is a Hibernate/JDBC
    // session hint with no jakarta equivalent. Behavior is preserved (still a single TX); the
    // hint is dropped.
    @Transactional
    public List<FolderResponse> listFolders() {
        ensureStorageEnabled();
        User user = requireAuthenticatedUser();
        return folderRepository.findAllByOwnerOrderByName(user).stream()
                .map(FolderResponse::from)
                .toList();
    }

    @Transactional
    public FolderResponse createFolder(CreateFolderRequest request) {
        ensureStorageEnabled();
        User user = requireAuthenticatedUser();
        // Reject self-parenting up-front. Without this, a client posting
        // {id: X, parentFolderId: X} for a folder X they already own would silently
        // get the existing folder back (idempotent path) and never learn that the
        // parentFolderId they sent was ignored. For new ids the parent lookup would
        // 404, but the message is misleading.
        if (request.getId() != null && request.getId().equals(request.getParentFolderId())) {
            throw new WebApplicationException(
                    "A folder cannot be its own parent", Response.Status.BAD_REQUEST);
        }
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
            throw new WebApplicationException(
                    "A folder with this id already exists; choose a different id",
                    Response.Status.CONFLICT);
        }

        if (folderRepository.countByOwner(user) >= MAX_FOLDERS_PER_USER) {
            throw new WebApplicationException(
                    "Folder limit reached (max " + MAX_FOLDERS_PER_USER + " per user)",
                    Response.Status.CONFLICT);
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
        ensureStorageEnabled();
        User user = requireAuthenticatedUser();
        Folder folder = requireOwnedFolder(id, user);

        if (request.getName() != null) {
            String trimmed = request.getName().trim();
            if (trimmed.isEmpty()) {
                // Bean validation should already catch this via @Pattern, but be explicit so
                // an empty-after-trim payload reaches the user as a 400 instead of being
                // silently dropped.
                throw new WebApplicationException(
                        "Folder name cannot be blank", Response.Status.BAD_REQUEST);
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
     * them from its local cache. Files inside those folders are detached (folder_id set to null) -
     * never deleted.
     */
    @Transactional
    public List<UUID> deleteFolder(UUID id) {
        ensureStorageEnabled();
        User user = requireAuthenticatedUser();
        Folder folder = requireOwnedFolder(id, user);

        // Build the parent → children map once. Project to id-only via the
        // existing entity list (Hibernate already has the column loaded -
        // we only access f.getParent().getId() on a managed proxy, which
        // does NOT initialize the proxy because Hibernate has the FK
        // value cached at the join column).
        Map<UUID, List<UUID>> childIdsByParent = new HashMap<>();
        for (Folder f : folderRepository.findAllByOwnerOrderByName(user)) {
            UUID parentId = f.getParent() == null ? null : f.getParent().getId();
            childIdsByParent.computeIfAbsent(parentId, k -> new ArrayList<>()).add(f.getId());
        }

        // Iterative subtree collection - prior recursive form blew the JVM
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

    /**
     * Move a single owned file to a folder (or root when {@code folderId} is null). Owns its
     * own @Transactional rather than relying on the caller so the JDBC connection is released as
     * soon as the writes commit, not held through controller-side JSON serialization.
     */
    @Transactional
    public void moveFileToFolder(Long fileId, UUID folderId) {
        ensureStorageEnabled();
        User user = requireAuthenticatedUser();
        StoredFile file =
                storedFileRepository
                        .findByIdAndOwner(fileId, user)
                        .orElseThrow(
                                () ->
                                        new WebApplicationException(
                                                "File not found or not owned by current user",
                                                Response.Status.NOT_FOUND));
        file.setFolder(resolveOwnedFolder(folderId, user));
        // TODO: Migration required - StoredFileRepository is still a Spring Data JpaRepository;
        // save()/saveAll()/flush() resolve against it for now. When that repository is ported to
        // a Panache repository, map these to persist()/flush() accordingly.
        storedFileRepository.save(file);
    }

    /**
     * Bulk move that returns the moved + skipped split. Skipped == file ids the caller doesn't own
     * (or that no longer exist); the controller surfaces this as 207 Multi-Status.
     */
    @Transactional
    public BulkMoveResult bulkMoveFilesToFolder(UUID folderId, List<Long> fileIds) {
        ensureStorageEnabled();
        if (fileIds == null || fileIds.isEmpty()) {
            return new BulkMoveResult(List.of(), List.of());
        }
        if (fileIds.size() > BULK_MOVE_MAX_FILES) {
            throw new WebApplicationException(
                    "fileIds must contain between 1 and " + BULK_MOVE_MAX_FILES + " entries",
                    Response.Status.BAD_REQUEST);
        }
        User user = requireAuthenticatedUser();
        Folder target = resolveOwnedFolder(folderId, user);

        List<StoredFile> owned = storedFileRepository.findAllByIdInAndOwner(fileIds, user);
        Set<Long> ownedIds = new HashSet<>(owned.size());
        for (StoredFile f : owned) {
            f.setFolder(target);
            ownedIds.add(f.getId());
        }
        // If the target folder was deleted concurrently between resolveOwnedFolder and the
        // flush, the FK constraint fires. Spring surfaced this as DataIntegrityViolationException;
        // under Hibernate ORM the JPA equivalent is jakarta.persistence.PersistenceException (the
        // root of constraint-violation exceptions). Surface as 409 Conflict so the caller sees an
        // actionable error instead of a 500 stack.
        try {
            storedFileRepository.saveAll(owned);
            storedFileRepository.flush();
        } catch (PersistenceException ex) {
            throw new WebApplicationException(
                    "Target folder no longer exists; refresh and try again",
                    ex,
                    Response.Status.CONFLICT);
        }

        List<Long> moved = owned.stream().map(StoredFile::getId).toList();
        List<Long> skipped = fileIds.stream().filter(id -> !ownedIds.contains(id)).toList();
        if (!skipped.isEmpty()) {
            log.warn(
                    "bulkMove: user {} skipped {} of {} files (not owned or missing)",
                    user.getId(),
                    skipped.size(),
                    fileIds.size());
        }
        return new BulkMoveResult(moved, skipped);
    }

    /** Result of {@link #bulkMoveFilesToFolder}. Records are immutable + auto-serializable. */
    public record BulkMoveResult(List<Long> movedFileIds, List<Long> skippedFileIds) {}

    // ─── helpers ────────────────────────────────────────────────────

    /**
     * Resolve a placement-target folder. Distinct from {@link #resolveParent} because move targets
     * don't carry the parent-cycle semantics - we only need the folder to exist AND belong to the
     * caller. Returns null for null input (root).
     */
    private Folder resolveOwnedFolder(UUID folderId, User user) {
        if (folderId == null) return null;
        return folderRepository
                .findByIdAndOwner(folderId, user)
                .orElseThrow(
                        () ->
                                new WebApplicationException(
                                        "Folder does not exist or is not owned by you",
                                        Response.Status.BAD_REQUEST));
    }

    private Folder requireOwnedFolder(UUID id, User user) {
        return folderRepository
                .findByIdAndOwner(id, user)
                .orElseThrow(
                        () ->
                                new WebApplicationException(
                                        "Folder not found or not owned by current user",
                                        Response.Status.NOT_FOUND));
    }

    private Folder resolveParent(UUID parentId, User user, UUID forbidId) {
        if (parentId == null) return null;
        if (forbidId != null && parentId.equals(forbidId)) {
            throw new WebApplicationException(
                    "A folder cannot be its own parent", Response.Status.BAD_REQUEST);
        }
        Folder parent =
                folderRepository
                        .findByIdAndOwner(parentId, user)
                        .orElseThrow(
                                () ->
                                        new WebApplicationException(
                                                "Parent folder does not exist or is not owned by you",
                                                Response.Status.BAD_REQUEST));
        // Reject before the child is created/moved if attaching it would push the chain past the
        // depth cap. Done in one pass that also returns the cycle answer so we don't walk the
        // lazy-proxy chain twice.
        enforceDepthAndCycle(parent, user, forbidId);
        return parent;
    }

    /**
     * Single pass that walks the parent chain to root and (a) rejects if attaching a child here
     * would exceed MAX_FOLDER_DEPTH, (b) rejects if {@code forbidId} appears in the chain (cycle on
     * reparent), (c) rejects on a broken graph, and (d) rejects if any ancestor is owned by a
     * different user (defense-in-depth: callers always pass a parent already ownership-checked, but
     * the parent chain is followed via lazy proxy without re-checking ownership at each hop, so any
     * stray cross-owner edge in the database would otherwise leak ancestor folder ids through the
     * cycle error message). The walk is hard-bounded at MAX_FOLDER_DEPTH so a corrupted database
     * (chain longer than the API would allow) can never produce an unbounded SELECT loop.
     */
    private void enforceDepthAndCycle(Folder candidateParent, User user, UUID forbidId) {
        Folder cursor = candidateParent;
        Set<UUID> seen = new HashSet<>();
        int depth = 0;
        while (cursor != null) {
            if (cursor.getOwner() == null || !cursor.getOwner().getId().equals(user.getId())) {
                throw new WebApplicationException(
                        "Folder hierarchy is corrupted; contact support",
                        Response.Status.BAD_REQUEST);
            }
            if (forbidId != null && cursor.getId().equals(forbidId)) {
                throw new WebApplicationException(
                        "Cannot move a folder inside one of its descendants",
                        Response.Status.BAD_REQUEST);
            }
            if (!seen.add(cursor.getId())) {
                // broken graph (cycle in stored data)
                throw new WebApplicationException(
                        "Folder hierarchy is corrupted; contact support",
                        Response.Status.BAD_REQUEST);
            }
            depth += 1;
            // candidateParent is at depth 1 from the new child's perspective. After the walk,
            // `depth` equals the number of ancestors including candidateParent, which is the
            // depth at which the new child would live. Reject before exceeding the cap.
            if (depth >= MAX_FOLDER_DEPTH) {
                throw new WebApplicationException(
                        "Folder nesting limit reached (max " + MAX_FOLDER_DEPTH + " levels)",
                        Response.Status.BAD_REQUEST);
            }
            cursor = cursor.getParent();
        }
    }

    /**
     * Resolve the current authenticated {@link User}.
     *
     * <p>Spring's {@code SecurityContextHolder.getContext().getAuthentication().getPrincipal()}
     * returned the {@link User} entity directly (it used to implement {@code UserDetails}). Under
     * Quarkus the principal is exposed via {@link SecurityIdentity}. We pull the principal and
     * adapt it to the {@link User} entity.
     */
    private User requireAuthenticatedUser() {
        if (securityIdentity == null || securityIdentity.isAnonymous()) {
            throw new WebApplicationException(
                    "Authentication required", Response.Status.UNAUTHORIZED);
        }
        Principal principal = securityIdentity.getPrincipal();
        // TODO: Migration required - a Quarkus SecurityIdentityAugmentor/IdentityProvider must
        // attach the stirling.software.proprietary.security.model.User entity as the
        // SecurityIdentity principal (Spring exposed it directly via Authentication#getPrincipal,
        // since User used to implement UserDetails). Until that augmentor exists, this only
        // resolves when the principal IS the User entity; otherwise it rejects as 401 rather than
        // guessing at a username->User lookup.
        if (principal instanceof User user) {
            return user;
        }
        throw new WebApplicationException("Authentication required", Response.Status.UNAUTHORIZED);
    }
}
