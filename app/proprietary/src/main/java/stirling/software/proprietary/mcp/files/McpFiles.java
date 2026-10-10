package stirling.software.proprietary.mcp.files;

import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.crypto.ResourceUpload;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.service.FileStorageService;

/** MCP files are temporary stored files; downloads are public links that expire with them. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpFiles {

    private static final String SHARE_LINK_PATH = "/api/v1/storage/share-links/";

    private final FileStorageService storage;
    private final UserService userService;
    private final ApplicationProperties.Mcp mcp;
    private final ApplicationProperties.System system;

    public McpFiles(
            FileStorageService storage,
            @Lazy UserService userService,
            ApplicationProperties applicationProperties) {
        this.storage = storage;
        this.userService = userService;
        this.mcp = applicationProperties.getMcp();
        this.system = applicationProperties.getSystem();
    }

    /** A failure whose message is safe to hand back to the model. */
    public static class McpFileException extends Exception {
        public McpFileException(String message) {
            super(message);
        }
    }

    public record Loaded(byte[] bytes, String name) {}

    public User user(McpCallContext context) throws McpFileException {
        String username = context == null ? null : context.stirlingUserId();
        if (username == null) {
            throw new McpFileException("No Stirling account is bound to this connection.");
        }
        return userService
                .findByUsernameIgnoreCase(username)
                .orElseThrow(() -> new McpFileException("Stirling account not found."));
    }

    public StoredFile store(User owner, byte[] bytes, String name, String contentType)
            throws McpFileException {
        return store(owner, new ByteArrayResource(bytes), name, contentType, bytes.length);
    }

    /** Stores a result; {@code size} must be exact (pass -1 to buffer an unknown length). */
    public StoredFile store(User owner, Resource body, String name, String contentType, long size)
            throws McpFileException {
        try {
            if (size < 0) {
                try (InputStream in = body.getInputStream()) {
                    byte[] bytes = in.readAllBytes();
                    body = new ByteArrayResource(bytes);
                    size = bytes.length;
                }
            }
            Duration ttl = Duration.ofMinutes(mcp.getResultTtlMinutes());
            return storage.storeTemporaryFile(
                    owner, new ResourceUpload(body, name, contentType, size), ttl);
        } catch (ResponseStatusException e) {
            throw new McpFileException("Could not store the file: " + e.getReason());
        } catch (IOException e) {
            throw new McpFileException("Could not read the result file.");
        }
    }

    public Loaded load(User user, String fileId) throws McpFileException {
        String unknown = "Unknown or expired fileId '" + fileId + "'. Upload the file again.";
        long id;
        try {
            id = Long.parseLong(fileId.trim());
        } catch (NumberFormatException e) {
            throw new McpFileException(unknown);
        }
        try {
            StoredFile file = storage.getAccessibleFile(user, id);
            try (InputStream in = storage.loadFile(file).getInputStream()) {
                byte[] bytes = in.readAllBytes();
                return new Loaded(bytes, file.getOriginalFilename());
            }
        } catch (ResponseStatusException e) {
            throw new McpFileException(unknown);
        } catch (IOException e) {
            throw new McpFileException("Could not read fileId '" + fileId + "'.");
        }
    }

    /** Public link that expires with the file, or null when share links are off. */
    public String downloadUrl(User owner, StoredFile file) {
        if (!storage.canCreateShareLinks()) {
            return null;
        }
        try {
            FileShare share =
                    storage.createShareLink(
                            owner, file, ShareAccessRole.VIEWER, true, file.getExpiresAt());
            return baseUrl() + SHARE_LINK_PATH + share.getShareToken();
        } catch (ResponseStatusException e) {
            return null;
        }
    }

    private String baseUrl() {
        String backendUrl = system.getBackendUrl();
        if (backendUrl != null && !backendUrl.isBlank()) {
            return stripSlash(backendUrl.trim());
        }
        String resourceId = mcp.getAuth().getResourceId();
        if (resourceId != null && resourceId.endsWith("/mcp")) {
            return resourceId.substring(0, resourceId.length() - "/mcp".length());
        }
        return stripSlash(ServletUriComponentsBuilder.fromCurrentContextPath().toUriString());
    }

    private static String stripSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}
