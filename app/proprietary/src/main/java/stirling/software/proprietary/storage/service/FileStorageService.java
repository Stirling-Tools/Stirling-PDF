package stirling.software.proprietary.storage.service;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
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

import jakarta.mail.MessagingException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.FileShareAccess;
import stirling.software.proprietary.storage.model.FileShareAccessType;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StorageCleanupEntry;
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
import stirling.software.proprietary.storage.repository.StorageCleanupEntryRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

@Service
@Transactional
@RequiredArgsConstructor
@Slf4j
public class FileStorageService {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private final StoredFileRepository storedFileRepository;
    private final FileShareRepository fileShareRepository;
    private final FileShareAccessRepository fileShareAccessRepository;
    private final UserRepository userRepository;
    private final ApplicationProperties applicationProperties;
    private final StorageProvider storageProvider;
    private final Optional<EmailService> emailService;
    private final StorageCleanupEntryRepository storageCleanupEntryRepository;

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
        return storeFile(owner, file, null, null);
    }

    public StoredFile storeFile(
            User owner, MultipartFile file, MultipartFile historyBundle, MultipartFile auditLog) {
        ensureStorageEnabled();
        validateMainUpload(file);

        long uploadBytes = calculateUploadBytes(file, historyBundle, auditLog);
        enforceStorageQuotas(owner, uploadBytes, 0);

        StoredObject mainObject = null;
        StoredObject historyObject = null;
        StoredObject auditObject = null;
        try {
            mainObject = storageProvider.store(owner, file);
            if (isValidUpload(historyBundle)) {
                historyObject = storageProvider.store(owner, historyBundle);
            }
            if (isValidUpload(auditLog)) {
                auditObject = storageProvider.store(owner, auditLog);
            }

            StoredFile storedFile = new StoredFile();
            storedFile.setOwner(owner);
            storedFile.setOriginalFilename(mainObject.getOriginalFilename());
            storedFile.setContentType(mainObject.getContentType());
            storedFile.setSizeBytes(mainObject.getSizeBytes());
            storedFile.setStorageKey(mainObject.getStorageKey());
            applyHistoryMetadata(storedFile, historyObject);
            applyAuditMetadata(storedFile, auditObject);
            try {
                return storedFileRepository.save(storedFile);
            } catch (RuntimeException saveError) {
                cleanupStoredObject(mainObject);
                cleanupStoredObject(historyObject);
                cleanupStoredObject(auditObject);
                throw saveError;
            }
        } catch (IOException e) {
            cleanupStoredObject(mainObject);
            cleanupStoredObject(historyObject);
            cleanupStoredObject(auditObject);
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
        return replaceFile(owner, existing, file, null, null);
    }

    public StoredFile replaceFile(
            User owner,
            StoredFile existing,
            MultipartFile file,
            MultipartFile historyBundle,
            MultipartFile auditLog) {
        ensureStorageEnabled();
        if (!isOwner(existing, owner)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can update");
        }
        validateMainUpload(file);

        long newTotalBytes = calculateUploadBytes(file, historyBundle, auditLog, existing);
        enforceStorageQuotas(owner, newTotalBytes, totalStoredBytes(existing));

        StoredObject mainObject = null;
        StoredObject historyObject = null;
        StoredObject auditObject = null;
        String oldStorageKey = existing.getStorageKey();
        String oldHistoryKey = existing.getHistoryStorageKey();
        String oldAuditKey = existing.getAuditLogStorageKey();

        try {
            mainObject = storageProvider.store(owner, file);
            if (isValidUpload(historyBundle)) {
                historyObject = storageProvider.store(owner, historyBundle);
            }
            if (isValidUpload(auditLog)) {
                auditObject = storageProvider.store(owner, auditLog);
            }

            existing.setOriginalFilename(mainObject.getOriginalFilename());
            existing.setContentType(mainObject.getContentType());
            existing.setSizeBytes(mainObject.getSizeBytes());
            existing.setStorageKey(mainObject.getStorageKey());
            if (historyObject != null) {
                applyHistoryMetadata(existing, historyObject);
            }
            if (auditObject != null) {
                applyAuditMetadata(existing, auditObject);
            }

            StoredFile updated;
            try {
                updated = storedFileRepository.save(existing);
            } catch (RuntimeException saveError) {
                cleanupStoredObject(mainObject);
                cleanupStoredObject(historyObject);
                cleanupStoredObject(auditObject);
                throw saveError;
            }
            cleanupStoredKey(oldStorageKey);
            if (historyObject != null) {
                cleanupStoredKey(oldHistoryKey);
            }
            if (auditObject != null) {
                cleanupStoredKey(oldAuditKey);
            }

            return updated;
        } catch (IOException e) {
            cleanupStoredObject(mainObject);
            cleanupStoredObject(historyObject);
            cleanupStoredObject(auditObject);
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
        return storeFileResponse(owner, file, null, null);
    }

    public StoredFileResponse storeFileResponse(
            User owner, MultipartFile file, MultipartFile historyBundle, MultipartFile auditLog) {
        StoredFile storedFile = storeFile(owner, file, historyBundle, auditLog);
        return buildResponse(storedFile, owner);
    }

    public StoredFileResponse updateFileResponse(User owner, Long fileId, MultipartFile file) {
        return updateFileResponse(owner, fileId, file, null, null);
    }

    public StoredFileResponse updateFileResponse(
            User owner,
            Long fileId,
            MultipartFile file,
            MultipartFile historyBundle,
            MultipartFile auditLog) {
        StoredFile existing = getOwnedFile(owner, fileId);
        StoredFile updated = replaceFile(owner, existing, file, historyBundle, auditLog);
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
                                .filter(share -> !isShareLinkExpired(share))
                                .map(
                                        share ->
                                                ShareLinkResponse.builder()
                                                        .token(share.getShareToken())
                                                        .accessRole(
                                                                resolveShareRole(share)
                                                                        .name()
                                                                        .toLowerCase(Locale.ROOT))
                                                        .createdAt(share.getCreatedAt())
                                                        .expiresAt(share.getExpiresAt())
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
                                                        .username(
                                                                share.getSharedWithUser()
                                                                        .getUsername())
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
        List<String> storageKeys = collectStorageKeys(file);
        List<FileShare> shareLinks = fileShareRepository.findShareLinks(file);
        for (FileShare share : shareLinks) {
            fileShareAccessRepository.deleteByFileShare(share);
        }
        storedFileRepository.delete(file);
        for (String storageKey : storageKeys) {
            cleanupStoredKey(storageKey);
        }
    }

    public FileShare shareWithUser(
            User owner, StoredFile file, String username, ShareAccessRole role) {
        ensureStorageEnabled();
        ensureSharingEnabled();
        if (!isOwner(file, owner)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can share");
        }

        String normalizedUsername = username != null ? username.trim() : "";
        boolean isEmail = isEmailAddress(normalizedUsername);

        Optional<User> targetUserOpt = userRepository.findByUsernameIgnoreCase(normalizedUsername);
        if (targetUserOpt.isPresent()) {
            User targetUser = targetUserOpt.get();
            if (targetUser.getId().equals(owner.getId())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Cannot share with yourself");
            }

            FileShare share =
                    fileShareRepository
                            .findByFileAndSharedWithUser(file, targetUser)
                            .map(
                                    existingShare -> {
                                        existingShare.setAccessRole(role);
                                        return fileShareRepository.save(existingShare);
                                    })
                            .orElseGet(
                                    () -> {
                                        FileShare newShare = new FileShare();
                                        newShare.setFile(file);
                                        newShare.setSharedWithUser(targetUser);
                                        newShare.setAccessRole(role);
                                        return fileShareRepository.save(newShare);
                                    });

            if (isEmail) {
                if (!isEmailSharingEnabled()) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "Email sharing is disabled");
                }
                if (!isShareLinksEnabled()) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Share links must be enabled for email sharing");
                }
                String shareLinkUrl = null;
                FileShare linkShare = createShareLink(owner, file, role);
                shareLinkUrl = buildShareLinkUrl(linkShare);
                sendShareNotification(owner, file, normalizedUsername, role, shareLinkUrl);
            }

            return share;
        }

        if (!isEmail) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found");
        }
        if (!isEmailSharingEnabled()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email sharing is disabled");
        }
        if (!isShareLinksEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Share links must be enabled for email sharing");
        }

        FileShare linkShare = createShareLink(owner, file, role);
        sendShareNotification(owner, file, normalizedUsername, role, buildShareLinkUrl(linkShare));
        return linkShare;
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
        share.setShareToken(UUID.randomUUID().toString());
        share.setAccessRole(role);
        share.setExpiresAt(resolveShareLinkExpiration());
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
        FileShare share =
                fileShareRepository
                        .findByShareTokenWithFile(token)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "Share link not found"));
        if (isShareLinkExpired(share)) {
            throw new ResponseStatusException(HttpStatus.GONE, "Share link has expired");
        }
        return share;
    }

    public boolean canAccessShareLink(FileShare share, Authentication authentication) {
        ensureStorageEnabled();
        if (!isShareLinksEnabled()) {
            return false;
        }
        if (isShareLinkExpired(share)) {
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
        if (isShareLinkExpired(share)) {
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
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Only the owner can view access");
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
            if (isShareLinkExpired(access.getFileShare())) {
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
                                    .owner(
                                            file != null && file.getOwner() != null
                                                    ? file.getOwner().getUsername()
                                                    : null)
                                    .ownedByCurrentUser(ownedByCurrentUser)
                                    .accessRole(
                                            share != null
                                                    ? resolveShareRole(share)
                                                            .name()
                                                            .toLowerCase(Locale.ROOT)
                                                    : null)
                                    .createdAt(share != null ? share.getCreatedAt() : null)
                                    .expiresAt(share != null ? share.getExpiresAt() : null)
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

    private void validateMainUpload(MultipartFile file) {
        if (!isValidUpload(file)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is required");
        }
    }

    private boolean isValidUpload(MultipartFile file) {
        return file != null && !file.isEmpty();
    }

    private long calculateUploadBytes(
            MultipartFile file, MultipartFile historyBundle, MultipartFile auditLog) {
        return safeSize(file) + safeSize(historyBundle) + safeSize(auditLog);
    }

    private long calculateUploadBytes(
            MultipartFile file,
            MultipartFile historyBundle,
            MultipartFile auditLog,
            StoredFile existing) {
        long historyBytes =
                isValidUpload(historyBundle)
                        ? safeSize(historyBundle)
                        : safeStoredBytes(existing.getHistorySizeBytes());
        long auditBytes =
                isValidUpload(auditLog)
                        ? safeSize(auditLog)
                        : safeStoredBytes(existing.getAuditLogSizeBytes());
        return safeSize(file) + historyBytes + auditBytes;
    }

    private long safeSize(MultipartFile file) {
        if (file == null) {
            return 0;
        }
        return Math.max(0, file.getSize());
    }

    private long totalStoredBytes(StoredFile file) {
        if (file == null) {
            return 0;
        }
        return file.getSizeBytes()
                + safeStoredBytes(file.getHistorySizeBytes())
                + safeStoredBytes(file.getAuditLogSizeBytes());
    }

    private long safeStoredBytes(Long value) {
        if (value == null) {
            return 0;
        }
        return Math.max(0, value);
    }

    private void enforceStorageQuotas(User owner, long newBytes, long existingBytes) {
        ApplicationProperties.Storage.Quotas quotas =
                applicationProperties.getStorage().getQuotas();
        if (quotas == null) {
            return;
        }
        long maxFileBytes = toBytes(quotas.getMaxFileMb());
        if (maxFileBytes > 0 && newBytes > maxFileBytes) {
            throw new ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE, "Stored file exceeds the maximum size");
        }

        long delta = newBytes - existingBytes;
        if (delta <= 0) {
            return;
        }

        long maxUserBytes = toBytes(quotas.getMaxStorageMbPerUser());
        if (maxUserBytes > 0) {
            long currentBytes = storedFileRepository.sumStorageBytesByOwner(owner);
            if (currentBytes + delta > maxUserBytes) {
                throw new ResponseStatusException(
                        HttpStatus.PAYLOAD_TOO_LARGE, "User storage quota exceeded");
            }
        }

        long maxTotalBytes = toBytes(quotas.getMaxStorageMbTotal());
        if (maxTotalBytes > 0) {
            long totalBytes = storedFileRepository.sumStorageBytesTotal();
            if (totalBytes + delta > maxTotalBytes) {
                throw new ResponseStatusException(
                        HttpStatus.PAYLOAD_TOO_LARGE, "System storage quota exceeded");
            }
        }
    }

    private long toBytes(long megabytes) {
        if (megabytes <= 0) {
            return megabytes;
        }
        return megabytes * 1024L * 1024L;
    }

    private void applyHistoryMetadata(StoredFile storedFile, StoredObject historyObject) {
        if (storedFile == null || historyObject == null) {
            return;
        }
        storedFile.setHistoryFilename(historyObject.getOriginalFilename());
        storedFile.setHistoryContentType(historyObject.getContentType());
        storedFile.setHistorySizeBytes(historyObject.getSizeBytes());
        storedFile.setHistoryStorageKey(historyObject.getStorageKey());
    }

    private void applyAuditMetadata(StoredFile storedFile, StoredObject auditObject) {
        if (storedFile == null || auditObject == null) {
            return;
        }
        storedFile.setAuditLogFilename(auditObject.getOriginalFilename());
        storedFile.setAuditLogContentType(auditObject.getContentType());
        storedFile.setAuditLogSizeBytes(auditObject.getSizeBytes());
        storedFile.setAuditLogStorageKey(auditObject.getStorageKey());
    }

    private List<String> collectStorageKeys(StoredFile file) {
        if (file == null) {
            return List.of();
        }
        return java.util.stream.Stream.of(
                        file.getStorageKey(),
                        file.getHistoryStorageKey(),
                        file.getAuditLogStorageKey())
                .filter(value -> value != null && !value.isBlank())
                .collect(Collectors.toList());
    }

    private void cleanupStoredObject(StoredObject storedObject) {
        if (storedObject == null) {
            return;
        }
        cleanupStoredKey(storedObject.getStorageKey());
    }

    private void cleanupStoredKey(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            return;
        }
        try {
            storageProvider.delete(storageKey);
        } catch (IOException e) {
            log.warn("Failed to delete storage key {}. Scheduling cleanup.", storageKey, e);
            StorageCleanupEntry entry = new StorageCleanupEntry();
            entry.setStorageKey(storageKey);
            storageCleanupEntryRepository.save(entry);
        }
    }

    private String buildShareLinkUrl(FileShare share) {
        if (share == null || share.getShareToken() == null) {
            return null;
        }
        String frontendUrl = applicationProperties.getSystem().getFrontendUrl();
        if (frontendUrl == null || frontendUrl.trim().isEmpty()) {
            return null;
        }
        String normalized = frontendUrl.trim();
        if (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized + "/share/" + share.getShareToken();
    }

    private void sendShareNotification(
            User owner, StoredFile file, String email, ShareAccessRole role, String shareLinkUrl) {
        if (emailService.isEmpty() || !applicationProperties.getMail().isEnabled()) {
            log.warn("Email sharing configured but mail service is unavailable");
            return;
        }
        String ownerName = owner != null ? owner.getUsername() : "A user";
        String fileName = file != null ? file.getOriginalFilename() : "a file";
        String subject = "A file was shared with you";
        StringBuilder body = new StringBuilder();
        body.append(ownerName)
                .append(" shared \"")
                .append(fileName)
                .append("\" with ")
                .append(role != null ? role.name().toLowerCase(Locale.ROOT) : "viewer")
                .append(" access.")
                .append(System.lineSeparator())
                .append(System.lineSeparator());
        if (shareLinkUrl != null) {
            body.append("Open the shared file: ")
                    .append(shareLinkUrl)
                    .append(System.lineSeparator());
        } else {
            String frontendUrl = applicationProperties.getSystem().getFrontendUrl();
            if (frontendUrl != null && !frontendUrl.trim().isEmpty()) {
                body.append("Sign in to access the file: ").append(frontendUrl.trim());
            }
        }
        try {
            emailService.get().sendPlainEmail(email, subject, body.toString(), false);
        } catch (MessagingException ex) {
            log.warn("Failed to send share email to {}", email, ex);
        }
    }

    private LocalDateTime resolveShareLinkExpiration() {
        int days = applicationProperties.getStorage().getSharing().getLinkExpirationDays();
        if (days <= 0) {
            return null;
        }
        return LocalDateTime.now().plus(days, ChronoUnit.DAYS);
    }

    private boolean isShareLinkExpired(FileShare share) {
        if (share == null || share.getExpiresAt() == null) {
            return false;
        }
        return LocalDateTime.now().isAfter(share.getExpiresAt());
    }

    private boolean hasReadAccess(ShareAccessRole role) {
        return role == ShareAccessRole.EDITOR
                || role == ShareAccessRole.COMMENTER
                || role == ShareAccessRole.VIEWER;
    }

    // Workflow-aware methods

    /**
     * Stores a file as part of a workflow with specific purpose and workflow link. This enables
     * tracking workflow files separately and applying workflow-specific logic.
     *
     * @param owner File owner (usually workflow session owner)
     * @param file File to store
     * @param purpose Purpose classification (SIGNING_ORIGINAL, SIGNING_SIGNED, etc.)
     * @param workflowSession Workflow session to link file to (nullable)
     * @return Stored file entity
     */
    public StoredFile storeWorkflowFile(
            User owner,
            MultipartFile file,
            stirling.software.proprietary.storage.model.FilePurpose purpose,
            stirling.software.proprietary.workflow.model.WorkflowSession workflowSession) {
        StoredFile storedFile = storeFile(owner, file);
        storedFile.setPurpose(purpose);
        storedFile.setWorkflowSession(workflowSession);
        return storedFileRepository.save(storedFile);
    }

    /**
     * Checks if a stored file is part of an active workflow. Files in active workflows may have
     * restricted operations (e.g., no deletion until workflow completes).
     *
     * @param file Stored file to check
     * @return true if file is part of an active workflow
     */
    public boolean isWorkflowFile(StoredFile file) {
        if (file.getWorkflowSession() == null) {
            return false;
        }
        return file.getWorkflowSession().isActive();
    }

    /**
     * Retrieves all files associated with a workflow session. Includes original file, processed
     * file, and any auxiliary files.
     *
     * @param workflowSession Workflow session
     * @return List of all files linked to the workflow
     */
    public List<StoredFile> getWorkflowFiles(
            stirling.software.proprietary.workflow.model.WorkflowSession workflowSession) {
        return storedFileRepository.findByWorkflowSession(workflowSession);
    }

    /**
     * Counts total storage bytes used by a workflow session. Useful for quota tracking and
     * reporting.
     *
     * @param workflowSession Workflow session
     * @return Total bytes used by workflow files
     */
    public long countWorkflowStorageBytes(
            stirling.software.proprietary.workflow.model.WorkflowSession workflowSession) {
        List<StoredFile> files = getWorkflowFiles(workflowSession);
        return files.stream().mapToLong(this::totalStoredBytes).sum();
    }

    /**
     * Validates that a user can delete a file, considering workflow constraints. Files in active
     * workflows cannot be deleted until the workflow completes.
     *
     * @param file File to validate
     * @param user User attempting deletion
     * @throws ResponseStatusException if deletion is not allowed
     */
    public void validateWorkflowDeletion(StoredFile file, User user) {
        if (isWorkflowFile(file)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Cannot delete file that is part of an active workflow");
        }
    }
}
