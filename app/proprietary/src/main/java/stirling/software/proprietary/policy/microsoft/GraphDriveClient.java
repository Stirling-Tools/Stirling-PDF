package stirling.software.proprietary.policy.microsoft;

import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.remote.CloudHttp;

import tools.jackson.databind.JsonNode;

/**
 * The Microsoft Graph drive operations the policy engine needs: find a library, list a folder,
 * download, delete and upload. Stateless apart from caching drive ids, which never change for a
 * library. Throttling (429/503) is retried with the server's Retry-After, a bounded number of
 * times. Download and upload-session URLs are pre-authenticated and on other hosts, so the bearer
 * token is never sent to them.
 */
@Slf4j
@Component
public class GraphDriveClient {

    /** Listing cap, matching the network sources; consume mode drains the rest on later sweeps. */
    public static final int MAX_FILES = 10_000;

    static final long SIMPLE_UPLOAD_LIMIT = 4L * 1024 * 1024;
    // Graph requires upload-session chunks in multiples of 320 KiB.
    static final int UPLOAD_CHUNK = 320 * 1024 * 32;

    private static final String ITEM_FIELDS = "id,name,size,file,folder,package,eTag,cTag";

    private final GraphEndpoints endpoints;
    private final GraphTokenProvider tokens;
    private final HttpClient http;
    private final Map<String, DriveRoot> roots = new ConcurrentHashMap<>();

    @Autowired
    public GraphDriveClient(GraphEndpoints endpoints, GraphTokenProvider tokens) {
        this(endpoints, tokens, CloudHttp.newClient());
    }

    GraphDriveClient(GraphEndpoints endpoints, GraphTokenProvider tokens, HttpClient http) {
        this.endpoints = endpoints;
        this.tokens = tokens;
        this.http = http;
    }

    /**
     * Where the location's paths start, resolved once and cached: a linked folder, the connected
     * user's own OneDrive, the pinned user's OneDrive, or the pinned SharePoint library.
     */
    public DriveRoot root(MicrosoftDriveConfig config) throws IOException {
        String key = config.location();
        DriveRoot cached = roots.get(key);
        if (cached != null) {
            return cached;
        }
        DriveRoot root;
        if (config.folderLink() != null) {
            root = linkedFolder(config);
        } else if (config.credential() instanceof MicrosoftDriveConfig.AccountCredential) {
            root =
                    new DriveRoot(
                            requireId(
                                    getJson(config, "/me/drive?$select=id", "find your OneDrive"),
                                    config),
                            null);
        } else if (config.drive() == MicrosoftDrive.ONEDRIVE) {
            root =
                    new DriveRoot(
                            requireId(
                                    getJson(
                                            config,
                                            "/users/"
                                                    + segment(config.user())
                                                    + "/drive?$select=id",
                                            "find the OneDrive of " + config.user()),
                                    config),
                            null);
        } else {
            root = new DriveRoot(sharePointDriveId(config), null);
        }
        roots.put(key, root);
        return root;
    }

    /**
     * Resolves a pasted OneDrive or SharePoint link through Graph's shares API, which needs only
     * file permissions (no site permission), so it works for a connected account as is.
     */
    private DriveRoot linkedFolder(MicrosoftDriveConfig config) throws IOException {
        String shareId =
                "u!"
                        + Base64.getUrlEncoder()
                                .withoutPadding()
                                .encodeToString(
                                        config.folderLink().getBytes(StandardCharsets.UTF_8));
        JsonNode item =
                getJson(
                        config,
                        "/shares/" + shareId + "/driveItem?$select=id,name,folder,parentReference",
                        "open the folder link");
        if (!item.has("folder")) {
            throw new IOException("The link is to a file, not a folder");
        }
        String driveId = text(item.path("parentReference"), "driveId");
        if (driveId == null || text(item, "id") == null) {
            throw new IOException("Microsoft Graph could not resolve the folder link");
        }
        return new DriveRoot(driveId, text(item, "id"));
    }

    private static String requireId(JsonNode node, MicrosoftDriveConfig config) throws IOException {
        String id = text(node, "id");
        if (id == null) {
            throw new IOException("Microsoft Graph returned no drive id for " + config.location());
        }
        return id;
    }

    /**
     * Every file under the config's folder, optionally descending into subfolders, truncated at
     * {@link #MAX_FILES}. A missing folder is an error rather than an empty listing, so a sweep
     * never reads "could not list" as "no files".
     */
    public List<DriveFile> list(MicrosoftDriveConfig config) throws IOException {
        DriveRoot root = root(config);
        List<DriveFile> files = new ArrayList<>();
        Deque<String> folders = new ArrayDeque<>();
        folders.add(config.directory());
        while (!folders.isEmpty() && files.size() < MAX_FILES) {
            String folder = folders.removeFirst();
            String url =
                    endpoints.graphUrl()
                            + itemPath(root, folder)
                            + (folder.isEmpty() ? "/children" : ":/children")
                            + "?$select="
                            + ITEM_FIELDS
                            + "&$top=200";
            while (url != null && files.size() < MAX_FILES) {
                JsonNode page = getJsonAbsolute(config, url, "list folder '" + folder + "'");
                for (JsonNode item : page.path("value")) {
                    String name = text(item, "name");
                    if (name == null || name.startsWith(".")) {
                        continue;
                    }
                    String path = MicrosoftDriveIdentities.childPath(folder, name);
                    if (item.has("folder") && !item.has("package")) {
                        if (config.recursive()) {
                            folders.add(path);
                        }
                    } else if (item.has("file")) {
                        files.add(toFile(root.driveId(), root.key(), path, item));
                        if (files.size() >= MAX_FILES) {
                            break;
                        }
                    }
                }
                url = nextLink(page);
            }
        }
        return files;
    }

    /** The file's current state, or empty when it no longer exists. */
    public Optional<DriveFile> stat(MicrosoftDriveConfig config, DriveFile file)
            throws IOException {
        HttpResponse<String> response =
                send(
                        authorized(
                                        config,
                                        endpoints.graphUrl()
                                                + "/drives/"
                                                + segment(file.driveId())
                                                + "/items/"
                                                + segment(file.itemId())
                                                + "?$select="
                                                + ITEM_FIELDS)
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 404) {
            return Optional.empty();
        }
        requireSuccess(response, "read " + file.path());
        return Optional.of(
                toFile(file.driveId(), file.root(), file.path(), parse(response.body())));
    }

    /** Streams the file's content; the caller closes the stream. */
    public InputStream open(MicrosoftDriveConfig config, DriveFile file) throws IOException {
        HttpResponse<InputStream> response =
                send(
                        authorized(
                                        config,
                                        endpoints.graphUrl()
                                                + "/drives/"
                                                + segment(file.driveId())
                                                + "/items/"
                                                + segment(file.itemId())
                                                + "/content")
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.ofInputStream());
        return CloudHttp.download(http, response, file.path(), "Microsoft Graph");
    }

    /**
     * Deletes the file only while it still carries {@code file.eTag()}, so a version replaced after
     * it was read is never removed. Returns false when it changed; a file already gone counts as
     * deleted.
     */
    public boolean delete(MicrosoftDriveConfig config, DriveFile file) throws IOException {
        HttpRequest.Builder request =
                authorized(
                                config,
                                endpoints.graphUrl()
                                        + "/drives/"
                                        + segment(file.driveId())
                                        + "/items/"
                                        + segment(file.itemId()))
                        .DELETE();
        if (file.eTag() != null) {
            request.header("If-Match", file.eTag());
        }
        HttpResponse<String> response = send(request.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 412) {
            return false;
        }
        if (response.statusCode() == 404) {
            return true;
        }
        requireSuccess(response, "delete " + file.path());
        return true;
    }

    /**
     * Uploads {@code content} as {@code directory/name}, refusing to overwrite: returns empty when
     * the name is already taken, so the caller can pick another. Small files go in one request,
     * larger ones through a resumable upload session.
     */
    public Optional<DriveFile> upload(
            MicrosoftDriveConfig config, String directory, String name, Path content)
            throws IOException {
        DriveRoot root = root(config);
        String path = MicrosoftDriveIdentities.childPath(directory, name);
        long size = Files.size(content);
        if (size <= SIMPLE_UPLOAD_LIMIT) {
            HttpResponse<String> response =
                    send(
                            authorized(
                                            config,
                                            endpoints.graphUrl()
                                                    + itemPath(root, path)
                                                    + ":/content?@microsoft.graph.conflictBehavior=fail")
                                    .header("Content-Type", "application/octet-stream")
                                    .PUT(HttpRequest.BodyPublishers.ofFile(content))
                                    .build(),
                            HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 409) {
                return Optional.empty();
            }
            requireSuccess(response, "upload " + path);
            return Optional.of(toFile(root.driveId(), root.key(), path, parse(response.body())));
        }
        return uploadInSession(config, root, path, content, size);
    }

    private Optional<DriveFile> uploadInSession(
            MicrosoftDriveConfig config, DriveRoot root, String path, Path content, long size)
            throws IOException {
        HttpResponse<String> created =
                send(
                        authorized(
                                        config,
                                        endpoints.graphUrl()
                                                + itemPath(root, path)
                                                + ":/createUploadSession")
                                .header("Content-Type", "application/json")
                                .POST(
                                        HttpRequest.BodyPublishers.ofString(
                                                "{\"item\":{\"@microsoft.graph.conflictBehavior\":\"fail\"}}"))
                                .build(),
                        HttpResponse.BodyHandlers.ofString());
        if (created.statusCode() == 409) {
            return Optional.empty();
        }
        requireSuccess(created, "start uploading " + path);
        String uploadUrl = text(parse(created.body()), "uploadUrl");
        if (uploadUrl == null) {
            throw new IOException("Microsoft Graph returned no upload URL for " + path);
        }

        byte[] buffer = new byte[(int) Math.min(UPLOAD_CHUNK, size)];
        try (RandomAccessFile file = new RandomAccessFile(content.toFile(), "r")) {
            long offset = 0;
            while (offset < size) {
                int length = (int) Math.min(buffer.length, size - offset);
                file.readFully(buffer, 0, length);
                HttpResponse<String> chunk =
                        send(
                                HttpRequest.newBuilder(URI.create(uploadUrl))
                                        .timeout(Duration.ofMinutes(10))
                                        .header(
                                                "Content-Range",
                                                "bytes "
                                                        + offset
                                                        + "-"
                                                        + (offset + length - 1)
                                                        + "/"
                                                        + size)
                                        .PUT(
                                                HttpRequest.BodyPublishers.ofByteArray(
                                                        buffer, 0, length))
                                        .build(),
                                HttpResponse.BodyHandlers.ofString());
                offset += length;
                if (chunk.statusCode() == 409) {
                    cancelSession(uploadUrl);
                    return Optional.empty();
                }
                if (chunk.statusCode() >= 300) {
                    cancelSession(uploadUrl);
                    requireSuccess(chunk, "upload " + path);
                }
                if (offset >= size) {
                    return Optional.of(
                            toFile(root.driveId(), root.key(), path, parse(chunk.body())));
                }
            }
        }
        throw new IOException("Upload of " + path + " ended without a completed item");
    }

    private void cancelSession(String uploadUrl) {
        try {
            send(
                    HttpRequest.newBuilder(URI.create(uploadUrl)).DELETE().build(),
                    HttpResponse.BodyHandlers.discarding());
        } catch (IOException e) {
            log.debug("Could not cancel upload session: {}", e.getMessage());
        }
    }

    private String sharePointDriveId(MicrosoftDriveConfig config) throws IOException {
        String site =
                "/sites/"
                        + segment(config.siteHost())
                        + (config.sitePath().isEmpty()
                                ? ""
                                : ":/" + encodePath(config.sitePath()) + ":");
        String siteId =
                text(
                        getJson(
                                config,
                                site + "?$select=id",
                                "find SharePoint site " + config.location()),
                        "id");
        if (siteId == null) {
            throw new IOException("Microsoft Graph returned no site id for " + config.location());
        }
        if (config.library() == null) {
            return text(
                    getJson(
                            config,
                            "/sites/" + segment(siteId) + "/drive?$select=id",
                            "find the default library of " + config.location()),
                    "id");
        }
        JsonNode drives =
                getJson(
                        config,
                        "/sites/" + segment(siteId) + "/drives?$select=id,name",
                        "list libraries of " + config.location());
        List<String> names = new ArrayList<>();
        for (JsonNode drive : drives.path("value")) {
            String name = text(drive, "name");
            if (config.library().equalsIgnoreCase(name)) {
                return text(drive, "id");
            }
            names.add(name);
        }
        throw new IOException(
                "SharePoint site has no library named '"
                        + config.library()
                        + "' (found: "
                        + String.join(", ", names)
                        + ")");
    }

    private JsonNode getJson(MicrosoftDriveConfig config, String relativeUrl, String action)
            throws IOException {
        return getJsonAbsolute(config, endpoints.graphUrl() + relativeUrl, action);
    }

    private JsonNode getJsonAbsolute(MicrosoftDriveConfig config, String url, String action)
            throws IOException {
        HttpResponse<String> response =
                send(authorized(config, url).GET().build(), HttpResponse.BodyHandlers.ofString());
        requireSuccess(response, action);
        return parse(response.body());
    }

    /** Follows paging only within Graph, so the bearer token cannot be handed to another host. */
    private String nextLink(JsonNode page) throws IOException {
        String next = text(page, "@odata.nextLink");
        if (next == null) {
            return null;
        }
        URI graph = URI.create(endpoints.graphUrl());
        URI link = URI.create(next);
        if (!graph.getScheme().equalsIgnoreCase(link.getScheme())
                || !graph.getAuthority().equalsIgnoreCase(link.getAuthority())) {
            throw new IOException("Microsoft Graph paged to an unexpected host: " + link.getHost());
        }
        return next;
    }

    private HttpRequest.Builder authorized(MicrosoftDriveConfig config, String url)
            throws IOException {
        return HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofMinutes(2))
                .header("Authorization", "Bearer " + tokens.token(config))
                .header("Accept", "application/json");
    }

    private <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> handler)
            throws IOException {
        return CloudHttp.send(http, request, handler, "Microsoft Graph");
    }

    private static void requireSuccess(HttpResponse<String> response, String action)
            throws IOException {
        int status = response.statusCode();
        if (status >= 200 && status < 300) {
            return;
        }
        JsonNode error = parse(response.body()).path("error");
        String code = text(error, "code");
        String message = text(error, "message");
        StringBuilder detail =
                new StringBuilder("Could not ").append(action).append(": HTTP ").append(status);
        if (code != null) {
            detail.append(' ').append(code);
        }
        if (message != null) {
            detail.append(" - ").append(message);
        }
        if (status == 401 || status == 403) {
            detail.append(
                    " (check the app registration's Microsoft Graph application permissions and"
                            + " that an administrator granted consent)");
        }
        throw new IOException(detail.toString());
    }

    private static DriveFile toFile(String driveId, String root, String path, JsonNode item) {
        String name = text(item, "name");
        return new DriveFile(
                driveId,
                root,
                text(item, "id"),
                path,
                name == null ? path.substring(path.lastIndexOf('/') + 1) : name,
                item.path("size").asLong(0),
                text(item, "eTag"),
                text(item.path("file").path("hashes"), "quickXorHash"),
                text(item, "cTag"));
    }

    private String itemPath(DriveRoot root, String path) {
        String base =
                "/drives/"
                        + segment(root.driveId())
                        + (root.itemId() == null ? "/root" : "/items/" + segment(root.itemId()));
        return path.isEmpty() ? base : base + ":/" + encodePath(path);
    }

    private static String encodePath(String path) {
        StringBuilder out = new StringBuilder();
        for (String part : path.split("/")) {
            if (part.isEmpty()) {
                continue;
            }
            if (!out.isEmpty()) {
                out.append('/');
            }
            out.append(segment(part));
        }
        return out.toString();
    }

    private static String segment(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static JsonNode parse(String body) {
        return CloudHttp.parse(body);
    }

    private static String text(JsonNode node, String field) {
        return CloudHttp.text(node, field);
    }
}
