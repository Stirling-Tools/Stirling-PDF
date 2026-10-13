package stirling.software.proprietary.mcp.files;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.common.cluster.KeyValueCache;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * One-time upload links, so a chat app that cannot attach files (Claude, Codex) can still get a
 * file from the user's computer into Stirling: the user opens the link, or an agent that runs
 * commands posts the file to it. Each link belongs to one user, works once and expires.
 */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpUploadLinks {

    public static final Duration TTL = Duration.ofMinutes(15);
    public static final String PATH = "/api/v1/mcp/uploads/";
    private static final String NAMESPACE = "mcp-upload";
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_-]{43}");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final KeyValueCache cache;
    private final ObjectMapper mapper;
    private final McpFiles files;

    public McpUploadLinks(KeyValueCache cache, ObjectMapper mapper, McpFiles files) {
        this.cache = cache;
        this.mapper = mapper;
        this.files = files;
    }

    public record Link(String uploadId, String url) {}

    /** A finished upload, as the assistant needs it. */
    public record Uploaded(String fileId, String name, long size) {}

    /** Where a link stands for its owner: unknown (expired or not theirs), waiting, or done. */
    public record Status(boolean known, Uploaded uploaded) {}

    public Link create(String username) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        put(token, username, "open");
        return new Link(token, files.publicBaseUrl() + PATH + token);
    }

    /** True while the link still accepts a file. */
    public boolean isOpen(String token) {
        return entry(token).filter(e -> "open".equals(e.path("state").asText())).isPresent();
    }

    /** Claims an unused link for one upload and returns its owner; empty if used or expired. */
    public Optional<String> claim(String token) {
        Optional<String> owner =
                entry(token)
                        .filter(e -> "open".equals(e.path("state").asText()))
                        .map(e -> e.path("user").asText());
        owner.ifPresent(user -> put(token, user, "uploading"));
        return owner;
    }

    /** Opens a claimed link again after a failed upload, so the user can retry. */
    public void reopen(String token, String username) {
        put(token, username, "open");
    }

    private void put(String token, String username, String state) {
        ObjectNode entry = mapper.createObjectNode().put("user", username).put("state", state);
        cache.put(NAMESPACE, token, entry.toString(), TTL);
    }

    /** Marks the link used, keeping the result so the assistant can collect the fileId. */
    public void complete(String token, String username, Uploaded uploaded) {
        ObjectNode entry =
                mapper.createObjectNode()
                        .put("user", username)
                        .put("state", "done")
                        .put("fileId", uploaded.fileId())
                        .put("name", uploaded.name())
                        .put("size", uploaded.size());
        cache.put(NAMESPACE, token, entry.toString(), TTL);
    }

    /** The link's state for its owner; another user's link reads as unknown. */
    public Status status(String token, String username) {
        return entry(token)
                .filter(e -> e.path("user").asText().equalsIgnoreCase(username))
                .map(e -> new Status(true, uploaded(e)))
                .orElse(new Status(false, null));
    }

    /** The finished upload behind a used link; for the upload page, which shows only the name. */
    public Optional<Uploaded> done(String token) {
        return entry(token).map(McpUploadLinks::uploaded);
    }

    private static Uploaded uploaded(JsonNode e) {
        return "done".equals(e.path("state").asText())
                ? new Uploaded(
                        e.path("fileId").asText(), e.path("name").asText(), e.path("size").asLong())
                : null;
    }

    private Optional<JsonNode> entry(String token) {
        if (token == null || !TOKEN.matcher(token).matches()) {
            return Optional.empty();
        }
        return cache.get(NAMESPACE, token)
                .map(
                        json -> {
                            try {
                                return mapper.readTree(json);
                            } catch (RuntimeException e) {
                                return null;
                            }
                        });
    }
}
