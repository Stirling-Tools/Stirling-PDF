package stirling.software.proprietary.mcp.files;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.KeyValueCache;
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
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpFiles {

    static final int MAX_NAME_BYTES = 180;

    private static final String PUBLIC_LINK_PATH = "/api/v1/storage/share-links/";
    private static final String PRIVATE_LINK_PATH = "/share/";
    private static final String TEMP_NAMES = "mcp-temp-file-name";

    /** How chat hosts name a stored file (mentions, pickers); tools take it as a fileId. */
    public static final String FILE_URI_PREFIX = "stirling://files/";

    public static final String RESOURCE_URI_PREFIX = "stirling://file/";

    private final FileStorageService storage;
    private final FileStorage tempStore;
    private final UserService userService;
    private final ApplicationProperties applicationProperties;
    private final KeyValueCache cache;

    public McpFiles(
            FileStorageService storage,
            FileStorage tempStore,
            @Lazy UserService userService,
            ApplicationProperties applicationProperties,
            KeyValueCache cache) {
        this.storage = storage;
        this.tempStore = tempStore;
        this.userService = userService;
        this.applicationProperties = applicationProperties;
        this.cache = cache;
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
        name = fitName(name);
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
                rememberTempName(fileId, name);
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

    /**
     * Largest file the widget may send inline: base64 grows it by a third, and the JSON-RPC
     * envelope must still fit under mcp.maxRequestBytes.
     */
    public long maxInlineUploadBytes() {
        long envelope = 64L * 1024;
        return Math.max(
                0, (applicationProperties.getMcp().getMaxRequestBytes() - envelope) / 4 * 3);
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

    /**
     * A fileId, or the id inside a {@code stirling://files/<id>} URI or the {@code
     * stirling://file/<id>} resource link a result carries.
     */
    public static String idOf(String fileIdOrUri) {
        if (fileIdOrUri == null) {
            return null;
        }
        String trimmed = fileIdOrUri.trim();
        for (String prefix : List.of(FILE_URI_PREFIX, RESOURCE_URI_PREFIX)) {
            if (trimmed.startsWith(prefix)) {
                return trimmed.substring(prefix.length());
            }
        }
        return trimmed;
    }

    /** Loads one tool input with a budget of its own; see {@link #inputBudget()}. */
    public Loaded load(User user, String fileIdOrUri) throws McpFileException {
        return load(user, fileIdOrUri, inputBudget());
    }

    /**
     * The input allowance for one tool call: {@code mcp.maxInputFiles} files and {@code
     * mcp.maxInputFileBytes} bytes in total. Not thread-safe; one call uses it from one thread.
     */
    public InputBudget inputBudget() {
        ApplicationProperties.Mcp mcp = applicationProperties.getMcp();
        return new InputBudget(
                mcp.getMaxInputFileBytes() > 0 ? mcp.getMaxInputFileBytes() : Long.MAX_VALUE,
                mcp.getMaxInputFiles() > 0 ? mcp.getMaxInputFiles() : Integer.MAX_VALUE);
    }

    /** {@code mcp.maxPipelineCarryBytes}; 0 or less means no limit. */
    public long maxPipelineCarryBytes() {
        return applicationProperties.getMcp().getMaxPipelineCarryBytes();
    }

    /** Loads a tool input, refused before any content is read if it would overspend the budget. */
    public Loaded load(User user, String fileIdOrUri, InputBudget budget) throws McpFileException {
        budget.requireRoomFor(1);
        Loaded loaded =
                load(
                        user,
                        fileIdOrUri,
                        budget.remainingBytes,
                        "the input limit for one call",
                        "Pass fewer or smaller files");
        budget.spend(loaded.bytes().length);
        return loaded;
    }

    public static final class InputBudget {
        private long remainingBytes;
        private int remainingFiles;
        private final int maxFiles;

        public InputBudget(long maxBytes, int maxFiles) {
            this.remainingBytes = maxBytes;
            this.remainingFiles = maxFiles;
            this.maxFiles = maxFiles;
        }

        /** Refuses up front when {@code count} more files would pass the per-call file limit. */
        public void requireRoomFor(int count) throws McpFileException {
            if (count > remainingFiles) {
                throw new McpFileException(
                        "Too many input files: one call can read at most "
                                + maxFiles
                                + ". Pass fewer files, or merge them first.");
            }
        }

        private void spend(long bytes) {
            remainingFiles--;
            remainingBytes -= bytes;
        }
    }

    /** Checks ownership and size before opening content; reads at most the limit plus one byte. */
    public Loaded load(User user, String fileIdOrUri, long maxBytes) throws McpFileException {
        return load(
                user,
                fileIdOrUri,
                maxBytes,
                "the inline limit",
                "Use the result's download link instead");
    }

    private Loaded load(
            User user, String fileIdOrUri, long maxBytes, String limitName, String advice)
            throws McpFileException {
        SizeLimit limit = new SizeLimit(maxBytes, limitName, advice);
        String fileId = idOf(fileIdOrUri);
        String unknown = "Unknown or expired fileId '" + fileId + "'. Upload the file again.";
        Long storedId = parseStoredId(fileId);
        if (storedId != null && usesStoredFiles(user)) {
            try {
                StoredFile file = storage.getAccessibleFile(user, storedId);
                limit.require(file.getSizeBytes());
                try (InputStream in = storage.loadFile(file).getInputStream()) {
                    return new Loaded(limit.read(in), file.getOriginalFilename());
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
            if (maxBytes == Long.MAX_VALUE) {
                return new Loaded(tempStore.retrieveBytes(fileId), tempName(fileId));
            }
            limit.require(tempStore.getFileSize(fileId));
            try (InputStream in = tempStore.retrieveInputStream(fileId)) {
                return new Loaded(limit.read(in), tempName(fileId));
            }
        } catch (SecurityException | IllegalArgumentException e) {
            throw new McpFileException(unknown);
        } catch (IOException e) {
            throw new McpFileException("Could not read fileId '" + fileId + "'.");
        }
    }

    /**
     * Shortens a name to {@link #MAX_NAME_BYTES} UTF-8 bytes, keeping a short extension: local
     * storage prefixes it with a UUID, and most filesystems refuse names over 255 bytes.
     */
    static String fitName(String name) {
        if (name == null || name.getBytes(StandardCharsets.UTF_8).length <= MAX_NAME_BYTES) {
            return name;
        }
        int dot = name.lastIndexOf('.');
        String ext = dot > 0 && name.length() - dot <= 10 ? name.substring(dot) : "";
        String stem = name.substring(0, name.length() - ext.length());
        while (!stem.isEmpty()
                && (stem + ext).getBytes(StandardCharsets.UTF_8).length > MAX_NAME_BYTES) {
            stem = stem.substring(0, stem.offsetByCodePoints(stem.length(), -1));
        }
        return stem + ext;
    }

    private void rememberTempName(String fileId, String name) {
        if (name == null || name.isBlank()) {
            return;
        }
        try {
            cache.put(
                    TEMP_NAMES,
                    fileId,
                    name,
                    Duration.ofMinutes(applicationProperties.getMcp().getResultTtlMinutes()));
        } catch (RuntimeException e) {
            log.warn("Could not retain an MCP temp file's name: {}", e.getMessage());
        }
    }

    private String tempName(String fileId) {
        try {
            return cache.get(TEMP_NAMES, fileId).orElse(fileId);
        } catch (RuntimeException e) {
            log.warn("Could not read an MCP temp file's name: {}", e.getMessage());
            return fileId;
        }
    }

    private record SizeLimit(long maxBytes, String name, String advice) {
        void require(long size) throws McpFileException {
            if (size > maxBytes) {
                throw new McpFileException(
                        "File is "
                                + size
                                + " bytes, over "
                                + name
                                + " of "
                                + maxBytes
                                + " bytes. "
                                + advice
                                + ".");
            }
        }

        byte[] read(InputStream in) throws IOException, McpFileException {
            byte[] bytes =
                    maxBytes >= Integer.MAX_VALUE - 1L
                            ? in.readAllBytes()
                            : in.readNBytes((int) Math.max(0, maxBytes) + 1);
            require(bytes.length);
            return bytes;
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
        if (RequestContextHolder.getRequestAttributes() == null) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Set system.backendUrl so links can be built outside a request.");
        }
        return stripSlash(ServletUriComponentsBuilder.fromCurrentContextPath().toUriString());
    }

    private static String stripSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}
