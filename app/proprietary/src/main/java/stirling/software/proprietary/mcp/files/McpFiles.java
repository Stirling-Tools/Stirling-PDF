package stirling.software.proprietary.mcp.files;

import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.FileStorage;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.crypto.ResourceUpload;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.service.FileStorageService;

/** MCP files: the user's temporary stored files when storage is usable, else the temp store. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpFiles {

    private static final String PUBLIC_LINK_PATH = "/api/v1/storage/share-links/";
    private static final String PRIVATE_LINK_PATH = "/share/";

    /** How chat hosts name a stored file (mentions, pickers); tools take it as a fileId. */
    public static final String FILE_URI_PREFIX = "stirling://files/";

    private final FileStorageService storage;
    private final FileStorage tempStore;
    private final UserService userService;
    private final ApplicationProperties applicationProperties;

    public McpFiles(
            FileStorageService storage,
            FileStorage tempStore,
            @Lazy UserService userService,
            ApplicationProperties applicationProperties) {
        this.storage = storage;
        this.tempStore = tempStore;
        this.userService = userService;
        this.applicationProperties = applicationProperties;
    }

    /** A failure whose message is safe to hand back to the model. */
    public static class McpFileException extends Exception {
        public McpFileException(String message) {
            super(message);
        }
    }

    public record Loaded(byte[] bytes, String name) {}

    /** A saved result; {@code inline} is set when the result should also ride inline. */
    public record Saved(
            String fileId,
            String name,
            String contentType,
            long size,
            String downloadUrl,
            String openUrl,
            boolean privateLink,
            byte[] inline) {}

    /** One of the user's stored files, as offered in pickers and mentions. */
    public record Listed(
            String fileId, String name, String contentType, long size, LocalDateTime updated) {
        public String uri() {
            return FILE_URI_PREFIX + fileId;
        }
    }

    /** Result links: download the file, or open it in the Stirling editor. */
    record Links(String download, String open) {}

    /** The caller's Stirling account, or null when the token is not bound to one. */
    public User user(McpCallContext context) {
        String username = context == null ? null : context.stirlingUserId();
        if (username == null) {
            return null;
        }
        return userService.findByUsernameIgnoreCase(username).orElse(null);
    }

    /** True when results go to the user's stored files rather than the shared temp store. */
    public boolean usesStoredFiles(User user) {
        return user != null
                && applicationProperties.getMcp().isStoreResults()
                && applicationProperties.getStorage().isEnabled()
                && applicationProperties.getSecurity().isEnableLogin();
    }

    public Saved save(User user, byte[] bytes, String name, String contentType, boolean result)
            throws McpFileException {
        return save(user, new ByteArrayResource(bytes), name, contentType, bytes.length, result);
    }

    /** Saves a file; only a {@code result} gets a link or inline copy. Size -1 = unknown. */
    public Saved save(
            User user, Resource body, String name, String contentType, long size, boolean result)
            throws McpFileException {
        boolean stored = usesStoredFiles(user);
        try {
            byte[] inline = null;
            if (size < 0 || (result && wantsInline(stored, size))) {
                try (InputStream in = body.getInputStream()) {
                    byte[] bytes = in.readAllBytes();
                    body = new ByteArrayResource(bytes);
                    size = bytes.length;
                    inline = result && wantsInline(stored, size) ? bytes : null;
                }
            }
            if (!stored) {
                String fileId;
                try (InputStream in = body.getInputStream()) {
                    fileId =
                            (user == null
                                            ? tempStore.storeInputStream(in, name)
                                            : tempStore.storeInputStream(
                                                    in, name, user.getUsername()))
                                    .fileId();
                }
                return new Saved(fileId, name, contentType, size, null, null, false, inline);
            }
            Duration ttl = Duration.ofMinutes(applicationProperties.getMcp().getResultTtlMinutes());
            StoredFile file =
                    storage.storeTemporaryFile(
                            user, new ResourceUpload(body, name, contentType, size), ttl);
            Links links = result ? links(user, file) : null;
            return new Saved(
                    String.valueOf(file.getId()),
                    file.getOriginalFilename(),
                    file.getContentType() != null ? file.getContentType() : contentType,
                    file.getSizeBytes(),
                    links == null ? null : links.download(),
                    links == null ? null : links.open(),
                    links != null && !isPublicLinks(),
                    inline);
        } catch (ResponseStatusException e) {
            throw new McpFileException("Could not store the file: " + e.getReason());
        } catch (IOException e) {
            throw new McpFileException("Could not store the result file.");
        }
    }

    /** The user's live files, newest first, whose name contains {@code query} (any case). */
    public List<Listed> recent(User user, String query, int limit) {
        if (!usesStoredFiles(user)) {
            return List.of();
        }
        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        try {
            return storage.listLiveAccessibleFiles(user).stream()
                    .filter(f -> f.getOriginalFilename() != null)
                    .filter(f -> f.getOriginalFilename().toLowerCase(Locale.ROOT).contains(needle))
                    .sorted(Comparator.comparing(McpFiles::updated).reversed())
                    .limit(limit)
                    .map(
                            f ->
                                    new Listed(
                                            String.valueOf(f.getId()),
                                            f.getOriginalFilename(),
                                            f.getContentType(),
                                            f.getSizeBytes(),
                                            updated(f)))
                    .toList();
        } catch (ResponseStatusException e) {
            return List.of();
        }
    }

    /** One stored file the user can read, or null when it is unknown, expired or not theirs. */
    public Listed describe(User user, String fileIdOrUri) {
        Long id = parseStoredId(idOf(fileIdOrUri));
        if (id == null || !usesStoredFiles(user)) {
            return null;
        }
        try {
            StoredFile f = storage.getAccessibleFile(user, id);
            return new Listed(
                    String.valueOf(f.getId()),
                    f.getOriginalFilename(),
                    f.getContentType(),
                    f.getSizeBytes(),
                    updated(f));
        } catch (ResponseStatusException e) {
            return null;
        }
    }

    /** A fileId, or the id inside a {@code stirling://files/<id>} URI. */
    public static String idOf(String fileIdOrUri) {
        if (fileIdOrUri == null) {
            return null;
        }
        String trimmed = fileIdOrUri.trim();
        return trimmed.startsWith(FILE_URI_PREFIX)
                ? trimmed.substring(FILE_URI_PREFIX.length())
                : trimmed;
    }

    public Loaded load(User user, String fileIdOrUri) throws McpFileException {
        String fileId = idOf(fileIdOrUri);
        String unknown = "Unknown or expired fileId '" + fileId + "'. Upload the file again.";
        Long storedId = parseStoredId(fileId);
        if (storedId != null && usesStoredFiles(user)) {
            try {
                StoredFile file = storage.getAccessibleFile(user, storedId);
                try (InputStream in = storage.loadFile(file).getInputStream()) {
                    return new Loaded(in.readAllBytes(), file.getOriginalFilename());
                }
            } catch (ResponseStatusException e) {
                throw new McpFileException(unknown);
            } catch (IOException e) {
                throw new McpFileException("Could not read fileId '" + fileId + "'.");
            }
        }
        try {
            if (!tempStore.fileExists(fileId)) {
                throw new McpFileException(unknown);
            }
            return new Loaded(tempStore.retrieveBytes(fileId), fileId);
        } catch (SecurityException e) {
            throw new McpFileException(unknown);
        } catch (IOException e) {
            throw new McpFileException("Could not read fileId '" + fileId + "'.");
        }
    }

    private static LocalDateTime updated(StoredFile file) {
        LocalDateTime at = file.getUpdatedAt() != null ? file.getUpdatedAt() : file.getCreatedAt();
        return at != null ? at : LocalDateTime.MIN;
    }

    private boolean wantsInline(boolean stored, long size) {
        if (size < 0 || size > applicationProperties.getMcp().getMaxInlineResponseBytes()) {
            return false;
        }
        return switch (mode(applicationProperties.getMcp().getInlineResults(), "auto")) {
            case "always" -> true;
            case "never" -> false;
            // Stored results normally travel as a link; inline them when no link can be made.
            default -> !stored || !canLink();
        };
    }

    private boolean canLink() {
        return !"off".equals(mode(applicationProperties.getMcp().getDownloadLinks(), "private"))
                && storage.canCreateShareLinks();
    }

    /** Link that expires with the file, or null when links are off or unavailable. */
    Links links(User owner, StoredFile file) {
        if (!canLink()) {
            return null;
        }
        boolean isPublic = isPublicLinks();
        try {
            // A private link opens for its owner only, never for other signed-in users.
            FileShare share =
                    isPublic
                            ? storage.createShareLink(
                                    owner, file, ShareAccessRole.VIEWER, true, file.getExpiresAt())
                            : storage.createShareLink(
                                    owner,
                                    file,
                                    ShareAccessRole.VIEWER,
                                    file.getExpiresAt(),
                                    owner);
            // The share page runs ?action= once it has the file, after sign-in if needed.
            String page = frontendBaseUrl() + PRIVATE_LINK_PATH + share.getShareToken();
            String download =
                    isPublic
                            ? backendBaseUrl() + PUBLIC_LINK_PATH + share.getShareToken()
                            : page + "?action=download";
            return new Links(download, page + "?action=open");
        } catch (ResponseStatusException e) {
            return null;
        }
    }

    private boolean isPublicLinks() {
        return "public".equals(mode(applicationProperties.getMcp().getDownloadLinks(), "private"));
    }

    private static String mode(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim().toLowerCase(Locale.ROOT);
    }

    private static Long parseStoredId(String fileId) {
        try {
            return Long.parseLong(fileId.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // canCreateShareLinks() already requires system.frontendUrl.
    private String frontendBaseUrl() {
        return stripSlash(applicationProperties.getSystem().getFrontendUrl().trim());
    }

    /** The server's public address, for links the user or an agent opens from outside. */
    public String publicBaseUrl() {
        return backendBaseUrl();
    }

    private String backendBaseUrl() {
        String backendUrl = applicationProperties.getSystem().getBackendUrl();
        if (backendUrl != null && !backendUrl.isBlank()) {
            return stripSlash(backendUrl.trim());
        }
        String resourceId = applicationProperties.getMcp().getAuth().getResourceId();
        if (resourceId != null && resourceId.endsWith("/mcp")) {
            return resourceId.substring(0, resourceId.length() - "/mcp".length());
        }
        return stripSlash(ServletUriComponentsBuilder.fromCurrentContextPath().toUriString());
    }

    private static String stripSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}
