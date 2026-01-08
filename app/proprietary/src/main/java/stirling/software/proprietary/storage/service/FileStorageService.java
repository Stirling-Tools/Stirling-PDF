package stirling.software.proprietary.storage.service;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

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
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.LocalStorageProvider;
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

    private final StoredFileRepository storedFileRepository;
    private final FileShareRepository fileShareRepository;
    private final FileShareAccessRepository fileShareAccessRepository;
    private final UserRepository userRepository;
    private final ApplicationProperties applicationProperties;

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
        StorageProvider provider = resolveStorageProvider();

        try {
            StoredObject storedObject = provider.store(owner, file);
            StoredFile storedFile = new StoredFile();
            storedFile.setOwner(owner);
            storedFile.setOriginalFilename(storedObject.getOriginalFilename());
            storedFile.setContentType(storedObject.getContentType());
            storedFile.setSizeBytes(storedObject.getSizeBytes());
            storedFile.setStorageKey(storedObject.getStorageKey());
            return storedFileRepository.save(storedFile);
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
        StorageProvider provider = resolveStorageProvider();

        try {
            StoredObject storedObject = provider.store(owner, file);
            String oldStorageKey = existing.getStorageKey();
            existing.setOriginalFilename(storedObject.getOriginalFilename());
            existing.setContentType(storedObject.getContentType());
            existing.setSizeBytes(storedObject.getSizeBytes());
            existing.setStorageKey(storedObject.getStorageKey());

            StoredFile updated = storedFileRepository.save(existing);
            try {
                provider.delete(oldStorageKey);
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

    public StoredFile getOwnedFile(User owner, Long fileId) {
        ensureStorageEnabled();
        return storedFileRepository
                .findByIdAndOwnerWithShares(fileId, owner)
                .orElseThrow(
                        () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "File not found"));
    }

    public org.springframework.core.io.Resource loadFile(StoredFile file) {
        ensureStorageEnabled();
        StorageProvider provider = resolveStorageProvider();
        try {
            return provider.load(file.getStorageKey());
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
        StorageProvider provider = resolveStorageProvider();
        try {
            provider.delete(file.getStorageKey());
        } catch (IOException e) {
            log.error(
                    "Failed to delete stored file {} (key: {})",
                    file != null ? file.getId() : null,
                    file != null ? file.getStorageKey() : null,
                    e);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Failed to delete file", e);
        }
        storedFileRepository.delete(file);
    }

    public FileShare shareWithUser(User owner, StoredFile file, String username) {
        ensureStorageEnabled();
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
            return existing.get();
        }

        FileShare share = new FileShare();
        share.setFile(file);
        share.setSharedWithUser(targetUser);
        share.setPublicLink(false);
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

    public FileShare createShareLink(User owner, StoredFile file, boolean publicLink) {
        ensureStorageEnabled();
        if (!isOwner(file, owner)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can share");
        }
        if (publicLink && !applicationProperties.getStorage().getShareLinks().isAllowPublic()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Public share links are disabled");
        }

        FileShare share = new FileShare();
        share.setFile(file);
        share.setPublicLink(publicLink);
        share.setShareToken(UUID.randomUUID().toString());
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
        if (share.isPublicLink()) {
            return true;
        }
        if (authentication == null
                || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            return false;
        }
        ShareLinkAccessMode accessMode = resolveShareLinkAccessMode();
        if (accessMode == ShareLinkAccessMode.AUTHENTICATED) {
            return true;
        }
        User user = extractAuthenticatedUser(authentication);
        if (user == null) {
            return false;
        }
        Long fileId = share.getFile().getId();
        if (storedFileRepository.findByIdAndOwner(fileId, user).isPresent()) {
            return true;
        }
        return fileShareRepository.findByFileAndSharedWithUser(share.getFile(), user).isPresent();
    }

    public void recordShareAccess(FileShare share, Authentication authentication, boolean inline) {
        if (share == null) {
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
        return fileShareAccessRepository.findByFileShareOrderByAccessedAtDesc(share);
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

    private ShareLinkAccessMode resolveShareLinkAccessMode() {
        String configured =
                Optional.ofNullable(applicationProperties.getStorage().getShareLinks().getAccessMode())
                        .orElse("authenticated")
                        .trim()
                        .toLowerCase(Locale.ROOT);
        if ("authenticated".equals(configured) || "auth".equals(configured)) {
            return ShareLinkAccessMode.AUTHENTICATED;
        }
        if ("shared-users".equals(configured)
                || "shared_users".equals(configured)
                || "sharedusers".equals(configured)) {
            return ShareLinkAccessMode.SHARED_USERS;
        }
        throw new ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "Invalid share link access mode: " + configured);
    }

    private StorageProvider resolveStorageProvider() {
        String providerName =
                Optional.ofNullable(applicationProperties.getStorage().getProvider())
                        .orElse("local")
                        .toLowerCase(Locale.ROOT);
        if (!"local".equals(providerName)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_IMPLEMENTED, "Storage provider not supported: " + providerName);
        }
        String basePathValue = applicationProperties.getStorage().getLocal().getBasePath();
        Path basePath = Paths.get(basePathValue).toAbsolutePath().normalize();
        return new LocalStorageProvider(basePath);
    }

    private enum ShareLinkAccessMode {
        AUTHENTICATED,
        SHARED_USERS
    }
}
