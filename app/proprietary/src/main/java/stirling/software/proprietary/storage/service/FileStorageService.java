package stirling.software.proprietary.storage.service;

import java.io.IOException;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.FileShareAccess;
import stirling.software.proprietary.storage.model.FileShareAccessType;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.model.api.ShareLinkAccessResponse;
import stirling.software.proprietary.storage.model.api.ShareLinkMetadataResponse;
import stirling.software.proprietary.storage.model.api.ShareLinkResponse;
import stirling.software.proprietary.storage.model.api.SharedUserResponse;
import stirling.software.proprietary.storage.model.api.StoredFileResponse;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;
import stirling.software.proprietary.storage.repository.FileShareAccessRepository;
import stirling.software.proprietary.storage.repository.FileShareRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

@Service
@Transactional
@RequiredArgsConstructor
@Slf4j
public class FileStorageService {

    private static final Pattern EMAIL_PATTERN =
            Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private final StoredFileRepository storedFileRepository;
    private final FileShareRepository fileShareRepository;
    private final FileShareAccessRepository fileShareAccessRepository;
    private final UserRepository userRepository;
    private final ApplicationProperties applicationProperties;
    private final StorageProvider storageProvider;

    public void ensureStorageEnabled() {
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Storage requires login to be enabled");
        }
        if (!applicationProperties.getStorage().isEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Storage is disabled");
        }
    }

    public User requireAuthenticatedUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }

        Object principal = authentication.getPrincipal();
        if (principal instanceof User user) {
            return user;
        }

        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unsupported user principal");
    }

    public List<StoredFile> listAccessibleFiles(User user) {
        ensureStorageEnabled();
        return storedFileRepository.findAccessibleFiles(user);
    }

    public StoredFile storeFile(User owner, MultipartFile file) {
        ensureStorageEnabled();

        try {
            StoredObject storedObject = storageProvider.store(owner, file);
            StoredFile storedFile = new StoredFile();
            storedFile.setOwner(owner);
            storedFile.setOriginalFilename(storedObject.getOriginalFilename());
            storedFile.setContentType(storedObject.getContentType());
            storedFile.setSizeBytes(storedObject.getSizeBytes());
            storedFile.setStorageKey(storedObject.getStorageKey());
            try {
                return storedFileRepository.save(storedFile);
            } catch (RuntimeException saveError) {
                try {
                    storageProvider.delete(storedObject.getStorageKey());
                } catch (IOException deleteError) {
                    log.warn(
                            "Failed to delete stored file (key: {}) after save failure",
                            storedObject.getStorageKey(),
                            deleteError);
                }
                throw saveError;
            }
        } catch (IOException e) {
            log.error(
                    "Failed to store file for user {} (name: {}, size: {})",
                    owner != null ? owner.getId() : null,
                    file != null ? file.getOriginalFilename() : null,
                    file != null ? file.getSize() : null,
                    e);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Failed to store file", e);
        }
    }

    public StoredFile replaceFile(User owner, StoredFile existing, MultipartFile file) {
        ensureStorageEnabled();
        if (!isOwner(existing, owner)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can update");
        }

        try {
            StoredObject storedObject = storageProvider.store(owner, file);
            String oldStorageKey = existing.getStorageKey();
            existing.setOriginalFilename(storedObject.getOriginalFilename());
            existing.setContentType(storedObject.getContentType());
            existing.setSizeBytes(storedObject.getSizeBytes());
            existing.setStorageKey(storedObject.getStorageKey());

            StoredFile updated;
            try {
                updated = storedFileRepository.save(existing);
            } catch (RuntimeException saveError) {
                try {
                    storageProvider.delete(storedObject.getStorageKey());
                } catch (IOException deleteError) {
                    log.warn(
                            "Failed to delete stored file (key: {}) after update failure",
                            storedObject.getStorageKey(),
                            deleteError);
                }
                throw saveError;
            }
            try {
                storageProvider.delete(oldStorageKey);
            } catch (IOException deleteError) {
                log.warn(
                        "Failed to delete old stored file {} (key: {}) after update",
                        existing.getId(),
                        oldStorageKey,
                        deleteError);
            }

            return updated;
        } catch (IOException e) {
            log.error(
                    "Failed to update stored file {} for user {}",
                    existing.getId(),
                    owner != null ? owner.getId() : null,
                    e);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Failed to update file", e);
        }
    }

    public StoredFile getAccessibleFile(User user, Long fileId) {
        ensureStorageEnabled();
        StoredFile file =
                storedFileRepository
                        .findByIdWithShares(fileId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "File not found"));
        if (isOwner(file, user)) {
            return file;
        }

        boolean sharedWithUser =
                file.getShares().stream()
                        .anyMatch(
                                share ->
                                        share.getSharedWithUser() != null
                                                && share.getSharedWithUser()
                                                        .getId()
                                                        .equals(user.getId()));
        if (!sharedWithUser) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }

        return file;
    }

    public void requireEditorAccess(User user, StoredFile file) {
        if (isOwner(file, user)) {
            return;
        }
        ShareAccessRole role = resolveUserShareRole(file, user);
        if (role != ShareAccessRole.EDITOR) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Insufficient permissions to download");
        }
    }

    public void requireEditorAccess(FileShare share) {
        ShareAccessRole role = resolveShareRole(share);
        if (role != ShareAccessRole.EDITOR) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Insufficient permissions to download");
        }
    }

    public void requireReadAccess(User user, StoredFile file) {
        if (isOwner(file, user)) {
            return;
        }
        ShareAccessRole role = resolveUserShareRole(file, user);
        if (!hasReadAccess(role)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Insufficient permissions to access this file");
        }
    }

    public void requireReadAccess(FileShare share) {
        ShareAccessRole role = resolveShareRole(share);
        if (!hasReadAccess(role)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Insufficient permissions to access this file");
        }
    }

    public StoredFile getOwnedFile(User owner, Long fileId) {
        ensureStorageEnabled();
        return storedFileRepository
                .findByIdAndOwnerWithShares(fileId, owner)
                .orElseThrow(
                        () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "File not found"));
    }

    public StoredFileResponse storeFileResponse(User owner, MultipartFile file) {
        StoredFile storedFile = storeFile(owner, file);
        return buildResponse(storedFile, owner);
    }

    public StoredFileResponse updateFileResponse(User owner, Long fileId, MultipartFile file) {
        StoredFile existing = getOwnedFile(owner, fileId);
        StoredFile updated = replaceFile(owner, existing, file);
        return buildResponse(updated, owner);
    }

    public List<StoredFileResponse> listAccessibleFileResponses(User user) {
        List<StoredFile> files = listAccessibleFiles(user);
        Map<Long, ShareAccessRole> roleByFileId = new HashMap<>();
        if (!files.isEmpty()) {
            List<FileShare> shares = fileShareRepository.findBySharedWithUserAndFileIn(user, files);
            for (FileShare share : shares) {
                StoredFile sharedFile = share.getFile();
                if (sharedFile != null && sharedFile.getId() != null) {
                    roleByFileId.put(sharedFile.getId(), resolveShareRole(share));
                }
            }
        }
        return files.stream()
                .sorted(Comparator.comparing(StoredFile::getCreatedAt).reversed())
                .map(file -> buildResponse(file, user, roleByFileId.get(file.getId())))
                .collect(Collectors.toList());
    }

    public StoredFileResponse getAccessibleFileResponse(User user, Long fileId) {
        StoredFile file = getAccessibleFile(user, fileId);
        return buildResponse(file, user);
    }

    public StoredFileResponse shareWithUserResponse(
            User owner, Long fileId, String username, ShareAccessRole role) {
        StoredFile file = getOwnedFile(owner, fileId);
        shareWithUser(owner, file, username, role);
        StoredFile updated = getOwnedFile(owner, fileId);
        return buildResponse(updated, owner);
    }

    private StoredFileResponse buildResponse(StoredFile file, User currentUser) {
        return buildResponse(file, currentUser, null);
    }

    private StoredFileResponse buildResponse(
            StoredFile file, User currentUser, ShareAccessRole accessRoleOverride) {
        boolean ownedByCurrentUser =
                file.getOwner() != null
                        && Objects.equals(file.getOwner().getId(), currentUser.getId());
        String accessRole =
                ownedByCurrentUser
                        ? ShareAccessRole.EDITOR.name().toLowerCase(Locale.ROOT)
                        : Optional.ofNullable(accessRoleOverride)
                                .orElseGet(() -> resolveUserShareRole(file, currentUser))
                                .name()
                                .toLowerCase(Locale.ROOT);
        List<String> sharedWithUsers =
                ownedByCurrentUser
                        ? file.getShares().stream()
                                .map(FileShare::getSharedWithUser)
                                .filter(Objects::nonNull)
                                .map(User::getUsername)
                                .sorted(String.CASE_INSENSITIVE_ORDER)
                                .collect(Collectors.toList())
                        : List.of();
        List<ShareLinkResponse> shareLinks =
                ownedByCurrentUser && isShareLinksEnabled()
                        ? file.getShares().stream()
                                .filter(share -> share.getShareToken() != null)
                                .map(
                                        share ->
                                                ShareLinkResponse.builder()
                                                        .token(share.getShareToken())
                                                        .accessRole(
                                                                resolveShareRole(share)
                                                                        .name()
                                                                        .toLowerCase(Locale.ROOT))
                                                        .createdAt(share.getCreatedAt())
                                                        .build())
                                .sorted(Comparator.comparing(ShareLinkResponse::getCreatedAt))
                                .collect(Collectors.toList())
                        : List.of();
        List<SharedUserResponse> sharedUsers =
                ownedByCurrentUser
                        ? file.getShares().stream()
                                .filter(share -> share.getSharedWithUser() != null)
                                .map(
                                        share ->
                                                SharedUserResponse.builder()
                                                        .username(share.getSharedWithUser().getUsername())
                                                        .accessRole(
                                                                resolveShareRole(share)
                                                                        .name()
                                                                        .toLowerCase(Locale.ROOT))
                                                        .build())
                                .sorted(
                                        Comparator.comparing(
                                                SharedUserResponse::getUsername,
                                                String.CASE_INSENSITIVE_ORDER))
                                .collect(Collectors.toList())
                        : List.of();
        return StoredFileResponse.builder()
                .id(file.getId())
                .fileName(file.getOriginalFilename())
                .contentType(file.getContentType())
                .sizeBytes(file.getSizeBytes())
                .owner(file.getOwner() != null ? file.getOwner().getUsername() : null)
                .ownedByCurrentUser(ownedByCurrentUser)
                .accessRole(accessRole)
                .createdAt(file.getCreatedAt())
                .updatedAt(file.getUpdatedAt())
                .sharedWithUsers(sharedWithUsers)
                .sharedUsers(sharedUsers)
                .shareLinks(shareLinks)
                .build();
    }

    public ShareAccessRole normalizeShareRole(String role) {
        if (role == null || role.isBlank()) {
            return ShareAccessRole.EDITOR;
        }
        try {
            return ShareAccessRole.valueOf(role.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid share role");
        }
    }

    private ShareAccessRole resolveShareRole(FileShare share) {
        if (share == null || share.getAccessRole() == null) {
            return ShareAccessRole.EDITOR;
        }
        return share.getAccessRole();
    }

    private ShareAccessRole resolveUserShareRole(StoredFile file, User user) {
        if (file == null || user == null) {
            return ShareAccessRole.VIEWER;
        }
        Optional<FileShare> share = fileShareRepository.findByFileAndSharedWithUser(file, user);
        return share.map(this::resolveShareRole).orElse(ShareAccessRole.VIEWER);
    }

    public org.springframework.core.io.Resource loadFile(StoredFile file) {
        ensureStorageEnabled();
        try {
            return storageProvider.load(file.getStorageKey());
        } catch (IOException e) {
            log.error(
                    "Failed to load stored file {} (key: {})",
                    file != null ? file.getId() : null,
                    file != null ? file.getStorageKey() : null,
                    e);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Failed to load file", e);
        }
    }

    public void deleteFile(User owner, StoredFile file) {
        ensureStorageEnabled();
        if (!isOwner(file, owner)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can delete");
        }
        try {
            storageProvider.delete(file.getStorageKey());
        } catch (IOException e) {
            log.error(
                    "Failed to delete stored file {} (key: {})",
                    file != null ? file.getId() : null,
                    file != null ? file.getStorageKey() : null,
                    e);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Failed to delete file", e);
        }
        List<FileShare> shareLinks = fileShareRepository.findShareLinks(file);
        for (FileShare share : shareLinks) {
            fileShareAccessRepository.deleteByFileShare(share);
        }
        storedFileRepository.delete(file);
    }

    public FileShare shareWithUser(
            User owner, StoredFile file, String username, ShareAccessRole role) {
        ensureStorageEnabled();
        ensureSharingEnabled();
        if (isEmailAddress(username) && !isEmailSharingEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Email sharing is disabled");
        }
        if (!isOwner(file, owner)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can share");
        }

        User targetUser =
                userRepository
                        .findByUsernameIgnoreCase(username)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "User not found"));

        if (targetUser.getId().equals(owner.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot share with yourself");
        }

        Optional<FileShare> existing =
                fileShareRepository.findByFileAndSharedWithUser(file, targetUser);
        if (existing.isPresent()) {
            FileShare share = existing.get();
            share.setAccessRole(role);
            return fileShareRepository.save(share);
        }

        FileShare share = new FileShare();
        share.setFile(file);
        share.setSharedWithUser(targetUser);
        share.setPublicLink(false);
        share.setAccessRole(role);
        return fileShareRepository.save(share);
    }

    public void revokeUserShare(User owner, StoredFile file, String username) {
        ensureStorageEnabled();
        if (!isOwner(file, owner)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can revoke");
        }
        User targetUser =
                userRepository
                        .findByUsernameIgnoreCase(username)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "User not found"));
        fileShareRepository
                .findByFileAndSharedWithUser(file, targetUser)
                .ifPresent(fileShareRepository::delete);
    }

    public void leaveUserShare(User user, StoredFile file) {
        ensureStorageEnabled();
        if (isOwner(file, user)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Owners cannot leave their own file");
        }
        FileShare share =
                fileShareRepository
                        .findByFileAndSharedWithUser(file, user)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "Share not found"));
        fileShareRepository.delete(share);
    }

    public FileShare createShareLink(User owner, StoredFile file, ShareAccessRole role) {
        ensureStorageEnabled();
        ensureShareLinksEnabled();
        if (!isOwner(file, owner)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can share");
        }

        FileShare share = new FileShare();
        share.setFile(file);
        share.setPublicLink(false);
        share.setShareToken(UUID.randomUUID().toString());
        share.setAccessRole(role);
        return fileShareRepository.save(share);
    }

    public void revokeShareLink(User owner, StoredFile file, String token) {
        ensureStorageEnabled();
        if (!isOwner(file, owner)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can revoke");
        }
        FileShare share =
                fileShareRepository
                        .findByShareToken(token)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "Share link not found"));
        if (!share.getFile().getId().equals(file.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Share link mismatch");
        }
        fileShareAccessRepository.deleteByFileShare(share);
        fileShareRepository.delete(share);
    }

    public FileShare getShareByToken(String token) {
        ensureStorageEnabled();
        return fileShareRepository
                .findByShareTokenWithFile(token)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND, "Share link not found"));
    }

    public boolean canAccessShareLink(FileShare share, Authentication authentication) {
        ensureStorageEnabled();
        if (!isShareLinksEnabled()) {
            return false;
        }
        if (authentication == null
                || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            return false;
        }
        return true;
    }

    public void recordShareAccess(FileShare share, Authentication authentication, boolean inline) {
        if (share == null) {
            return;
        }
        if (!isShareLinksEnabled()) {
            return;
        }
        User user = extractAuthenticatedUser(authentication);
        if (user == null) {
            return;
        }
        FileShareAccess access = new FileShareAccess();
        access.setFileShare(share);
        access.setUser(user);
        access.setAccessType(inline ? FileShareAccessType.VIEW : FileShareAccessType.DOWNLOAD);
        fileShareAccessRepository.save(access);
    }

    public List<FileShareAccess> listShareAccesses(User owner, StoredFile file, String token) {
        ensureStorageEnabled();
        if (!isOwner(file, owner)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can view access");
        }
        FileShare share =
                fileShareRepository
                        .findByShareToken(token)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "Share link not found"));
        if (!share.getFile().getId().equals(file.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Share link mismatch");
        }
        return fileShareAccessRepository.findByFileShareWithUserOrderByAccessedAtDesc(share);
    }

    public List<ShareLinkAccessResponse> listShareAccessResponses(
            User owner, StoredFile file, String token) {
        return listShareAccesses(owner, file, token).stream()
                .map(
                        access ->
                                ShareLinkAccessResponse.builder()
                                        .username(
                                                access.getUser() != null
                                                        ? access.getUser().getUsername()
                                                        : null)
                                        .accessType(access.getAccessType().name())
                                        .accessedAt(access.getAccessedAt())
                                        .build())
                .collect(Collectors.toList());
    }

    public List<FileShareAccess> listAccessedShareLinks(User user) {
        ensureStorageEnabled();
        List<FileShareAccess> accesses = fileShareAccessRepository.findByUserWithShareAndFile(user);
        Map<String, FileShareAccess> latestByToken = new LinkedHashMap<>();
        for (FileShareAccess access : accesses) {
            if (access.getFileShare() == null) {
                continue;
            }
            String token = access.getFileShare().getShareToken();
            if (token == null || token.isBlank()) {
                continue;
            }
            if (!latestByToken.containsKey(token)) {
                latestByToken.put(token, access);
            }
        }
        return List.copyOf(latestByToken.values());
    }

    public List<ShareLinkMetadataResponse> listAccessedShareLinkResponses(User user) {
        return listAccessedShareLinks(user).stream()
                .map(
                        access -> {
                            FileShare share = access.getFileShare();
                            StoredFile file = share != null ? share.getFile() : null;
                            boolean ownedByCurrentUser =
                                    file != null
                                            && file.getOwner() != null
                                            && file.getOwner().getId().equals(user.getId());
                            return ShareLinkMetadataResponse.builder()
                                    .shareToken(share != null ? share.getShareToken() : null)
                                    .fileId(file != null ? file.getId() : null)
                                    .fileName(file != null ? file.getOriginalFilename() : null)
                                    .owner(file != null && file.getOwner() != null
                                            ? file.getOwner().getUsername()
                                            : null)
                                    .ownedByCurrentUser(ownedByCurrentUser)
                                    .accessRole(share != null
                                            ? resolveShareRole(share)
                                                    .name()
                                                    .toLowerCase(Locale.ROOT)
                                            : null)
                                    .createdAt(share != null ? share.getCreatedAt() : null)
                                    .lastAccessedAt(access.getAccessedAt())
                                    .build();
                        })
                .filter(response -> response.getShareToken() != null)
                .collect(Collectors.toList());
    }

    public void ensureSharingEnabled() {
        ensureStorageEnabled();
        if (!applicationProperties.getStorage().getSharing().isEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Sharing is disabled");
        }
    }

    public void ensureShareLinksEnabled() {
        ensureSharingEnabled();
        if (!isShareLinksEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Share links are disabled");
        }
    }

    private boolean isShareLinksEnabled() {
        if (!applicationProperties.getStorage().getSharing().isLinkEnabled()) {
            return false;
        }
        String frontendUrl = applicationProperties.getSystem().getFrontendUrl();
        return frontendUrl != null && !frontendUrl.trim().isEmpty();
    }

    private boolean isEmailSharingEnabled() {
        return applicationProperties.getStorage().getSharing().isEmailEnabled()
                && applicationProperties.getMail().isEnabled();
    }

    private boolean isEmailAddress(String value) {
        return value != null && EMAIL_PATTERN.matcher(value.trim()).matches();
    }

    private boolean isOwner(StoredFile file, User owner) {
        return file.getOwner() != null && file.getOwner().getId().equals(owner.getId());
    }

    private User extractAuthenticatedUser(Authentication authentication) {
        Object principal = authentication.getPrincipal();
        if (principal instanceof User user) {
            return user;
        }
        return null;
    }

    private boolean hasReadAccess(ShareAccessRole role) {
        return role == ShareAccessRole.EDITOR
                || role == ShareAccessRole.COMMENTER
                || role == ShareAccessRole.VIEWER;
    }

}
