package stirling.software.proprietary.policy.google;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.connectedaccount.OAuthHttp;
import stirling.software.proprietary.policy.remote.CloudHttp;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@Component
public class GoogleDriveClient {

    public static final int MAX_FILES = 10_000;
    static final long SIMPLE_UPLOAD_LIMIT = 5L * 1024 * 1024;
    static final int UPLOAD_CHUNK = 256 * 1024 * 32;

    static final String FOLDER_MIME = "application/vnd.google-apps.folder";
    private static final String NATIVE_PREFIX = "application/vnd.google-apps.";
    private static final String FILE_FIELDS = "id,name,mimeType,size,md5Checksum,version,parents";

    private static final ObjectMapper JSON = new ObjectMapper();

    private final GoogleEndpoints endpoints;
    private final GoogleTokenProvider tokens;
    private final HttpClient http;
    private final Map<String, String> folderIds = new ConcurrentHashMap<>();

    @Autowired
    public GoogleDriveClient(GoogleEndpoints endpoints, GoogleTokenProvider tokens) {
        this(endpoints, tokens, CloudHttp.newClient());
    }

    GoogleDriveClient(GoogleEndpoints endpoints, GoogleTokenProvider tokens, HttpClient http) {
        this.endpoints = endpoints;
        this.tokens = tokens;
        this.http = http;
    }

    public String folderId(GoogleDriveConfig config) throws IOException {
        String cached = folderIds.get(config.location());
        if (cached != null) {
            return cached;
        }
        String id = config.folderId();
        if (id == null) {
            id = "root";
            for (String segment :
                    config.folder().isEmpty() ? new String[0] : config.folder().split("/")) {
                id = childFolder(config, id, segment);
            }
        }
        JsonNode folder =
                getJson(
                        config,
                        "/files/"
                                + OAuthHttp.encode(id)
                                + "?fields=id,mimeType,trashed&supportsAllDrives=true",
                        "open the folder");
        if (!FOLDER_MIME.equals(text(folder, "mimeType"))) {
            throw new IOException("That Drive item is not a folder");
        }
        if (folder.path("trashed").asBoolean(false)) {
            throw new IOException("That Drive folder is in the bin");
        }
        String resolved = text(folder, "id");
        folderIds.put(config.location(), resolved);
        return resolved;
    }

    private String childFolder(GoogleDriveConfig config, String parentId, String name)
            throws IOException {
        JsonNode page =
                getJson(
                        config,
                        "/files?q="
                                + OAuthHttp.encode(
                                        "name = '"
                                                + escapeQuery(name)
                                                + "' and '"
                                                + escapeQuery(parentId)
                                                + "' in parents and mimeType = '"
                                                + FOLDER_MIME
                                                + "' and trashed = false")
                                + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true",
                        "find folder '" + name + "'");
        JsonNode files = page.path("files");
        if (files.size() == 0) {
            throw new IOException("No folder named '" + name + "' in Google Drive");
        }
        if (files.size() > 1) {
            throw new IOException(
                    "More than one folder is named '"
                            + name
                            + "'; paste the folder's link instead");
        }
        return text(files.get(0), "id");
    }

    public List<GoogleFile> list(GoogleDriveConfig config) throws IOException {
        List<GoogleFile> files = new ArrayList<>();
        Deque<String> folders = new ArrayDeque<>();
        folders.add(folderId(config));
        while (!folders.isEmpty() && files.size() < MAX_FILES) {
            String folder = folders.removeFirst();
            String pageToken = null;
            do {
                String url =
                        endpoints.driveUrl()
                                + "/files?q="
                                + OAuthHttp.encode(
                                        "'"
                                                + escapeQuery(folder)
                                                + "' in parents and trashed = false")
                                + "&fields="
                                + OAuthHttp.encode("nextPageToken,files(" + FILE_FIELDS + ")")
                                + "&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true"
                                + (pageToken == null
                                        ? ""
                                        : "&pageToken=" + OAuthHttp.encode(pageToken));
                JsonNode page = getJsonAbsolute(config, url, "list the folder");
                for (JsonNode item : page.path("files")) {
                    String name = text(item, "name");
                    String mime = text(item, "mimeType");
                    if (name == null || name.startsWith(".")) {
                        continue;
                    }
                    if (FOLDER_MIME.equals(mime)) {
                        if (config.recursive()) {
                            folders.add(text(item, "id"));
                        }
                    } else if (mime == null || !mime.startsWith(NATIVE_PREFIX)) {
                        files.add(toFile(folder, item));
                        if (files.size() >= MAX_FILES) {
                            break;
                        }
                    }
                }
                pageToken = text(page, "nextPageToken");
            } while (pageToken != null && files.size() < MAX_FILES);
        }
        return files;
    }

    public Optional<GoogleFile> stat(GoogleDriveConfig config, GoogleFile file) throws IOException {
        HttpResponse<String> response =
                send(
                        authorized(
                                        config,
                                        endpoints.driveUrl()
                                                + "/files/"
                                                + OAuthHttp.encode(file.id())
                                                + "?fields="
                                                + OAuthHttp.encode(FILE_FIELDS + ",trashed")
                                                + "&supportsAllDrives=true")
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 404) {
            return Optional.empty();
        }
        requireSuccess(response, "read " + file.name());
        JsonNode item = parse(response.body());
        if (item.path("trashed").asBoolean(false)) {
            return Optional.empty();
        }
        return Optional.of(toFile(file.parentId(), item));
    }

    public InputStream open(GoogleDriveConfig config, GoogleFile file) throws IOException {
        HttpResponse<InputStream> response =
                send(
                        authorized(
                                        config,
                                        endpoints.driveUrl()
                                                + "/files/"
                                                + OAuthHttp.encode(file.id())
                                                + "?alt=media&supportsAllDrives=true")
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.ofInputStream());
        return CloudHttp.download(http, response, file.name(), "Google Drive");
    }

    public void trash(GoogleDriveConfig config, GoogleFile file) throws IOException {
        HttpResponse<String> response =
                send(
                        authorized(
                                        config,
                                        endpoints.driveUrl()
                                                + "/files/"
                                                + OAuthHttp.encode(file.id())
                                                + "?supportsAllDrives=true")
                                .header("Content-Type", "application/json")
                                .method(
                                        "PATCH",
                                        HttpRequest.BodyPublishers.ofString("{\"trashed\":true}"))
                                .build(),
                        HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 404) {
            return;
        }
        requireSuccess(response, "move " + file.name() + " to the bin");
    }

    public Optional<GoogleFile> upload(
            GoogleDriveConfig config, String folderId, String name, Path content)
            throws IOException {
        if (nameTaken(config, folderId, name)) {
            return Optional.empty();
        }
        ObjectNode metadata = JSON.createObjectNode();
        metadata.put("name", name);
        metadata.putArray("parents").add(folderId);
        long size = Files.size(content);
        String query = "&supportsAllDrives=true&fields=" + OAuthHttp.encode(FILE_FIELDS);
        if (size <= SIMPLE_UPLOAD_LIMIT) {
            String boundary = "stirling-" + UUID.randomUUID();
            ByteArrayOutputStream body = new ByteArrayOutputStream();
            body.writeBytes(
                    ("--"
                                    + boundary
                                    + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
                                    + metadata
                                    + "\r\n--"
                                    + boundary
                                    + "\r\nContent-Type: application/octet-stream\r\n\r\n")
                            .getBytes(StandardCharsets.UTF_8));
            body.writeBytes(Files.readAllBytes(content));
            body.writeBytes(("\r\n--" + boundary + "--").getBytes(StandardCharsets.UTF_8));
            HttpResponse<String> response =
                    send(
                            authorized(
                                            config,
                                            endpoints.uploadUrl()
                                                    + "/files?uploadType=multipart"
                                                    + query)
                                    .header(
                                            "Content-Type",
                                            "multipart/related; boundary=" + boundary)
                                    .POST(
                                            HttpRequest.BodyPublishers.ofByteArray(
                                                    body.toByteArray()))
                                    .build(),
                            HttpResponse.BodyHandlers.ofString());
            requireSuccess(response, "upload " + name);
            return Optional.of(toFile(folderId, parse(response.body())));
        }
        return Optional.of(uploadResumable(config, folderId, name, metadata, content, size, query));
    }

    private GoogleFile uploadResumable(
            GoogleDriveConfig config,
            String folderId,
            String name,
            ObjectNode metadata,
            Path content,
            long size,
            String query)
            throws IOException {
        HttpResponse<String> started =
                send(
                        authorized(
                                        config,
                                        endpoints.uploadUrl()
                                                + "/files?uploadType=resumable"
                                                + query)
                                .header("Content-Type", "application/json; charset=UTF-8")
                                .header("X-Upload-Content-Length", String.valueOf(size))
                                .POST(HttpRequest.BodyPublishers.ofString(metadata.toString()))
                                .build(),
                        HttpResponse.BodyHandlers.ofString());
        requireSuccess(started, "start uploading " + name);
        String session =
                started.headers()
                        .firstValue("Location")
                        .orElseThrow(() -> new IOException("Google returned no upload session"));
        byte[] buffer = new byte[(int) Math.min(UPLOAD_CHUNK, size)];
        try (RandomAccessFile file = new RandomAccessFile(content.toFile(), "r")) {
            long offset = 0;
            while (offset < size) {
                int length = (int) Math.min(buffer.length, size - offset);
                file.readFully(buffer, 0, length);
                HttpResponse<String> chunk =
                        send(
                                authorized(config, session)
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
                if (chunk.statusCode() == 308) {
                    continue;
                }
                requireSuccess(chunk, "upload " + name);
                return toFile(folderId, parse(chunk.body()));
            }
        }
        throw new IOException("Upload of " + name + " ended without a completed file");
    }

    private boolean nameTaken(GoogleDriveConfig config, String folderId, String name)
            throws IOException {
        JsonNode page =
                getJson(
                        config,
                        "/files?q="
                                + OAuthHttp.encode(
                                        "name = '"
                                                + escapeQuery(name)
                                                + "' and '"
                                                + escapeQuery(folderId)
                                                + "' in parents and trashed = false")
                                + "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true",
                        "check for " + name);
        return page.path("files").size() > 0;
    }

    private JsonNode getJson(GoogleDriveConfig config, String relativeUrl, String action)
            throws IOException {
        return getJsonAbsolute(config, endpoints.driveUrl() + relativeUrl, action);
    }

    private JsonNode getJsonAbsolute(GoogleDriveConfig config, String url, String action)
            throws IOException {
        HttpResponse<String> response =
                send(authorized(config, url).GET().build(), HttpResponse.BodyHandlers.ofString());
        requireSuccess(response, action);
        return parse(response.body());
    }

    private HttpRequest.Builder authorized(GoogleDriveConfig config, String url)
            throws IOException {
        return HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofMinutes(2))
                .header("Authorization", "Bearer " + tokens.token(config))
                .header("Accept", "application/json");
    }

    private <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> handler)
            throws IOException {
        return CloudHttp.send(http, request, handler, "Google Drive");
    }

    private static void requireSuccess(HttpResponse<String> response, String action)
            throws IOException {
        int status = response.statusCode();
        if (status >= 200 && status < 300) {
            return;
        }
        JsonNode error = parse(response.body()).path("error");
        String message = text(error, "message");
        StringBuilder detail =
                new StringBuilder("Could not ").append(action).append(": HTTP ").append(status);
        if (message != null) {
            detail.append(" - ").append(message);
        }
        if (status == 401 || status == 403) {
            detail.append(
                    " (check the account can open this folder, or that the service account has"
                            + " access)");
        }
        throw new IOException(detail.toString());
    }

    private static GoogleFile toFile(String parentId, JsonNode item) {
        return new GoogleFile(
                text(item, "id"),
                parentId,
                text(item, "name"),
                item.path("size").asLong(0),
                text(item, "md5Checksum"),
                text(item, "version"));
    }

    static String escapeQuery(String value) {
        return value.replace("\\", "\\\\").replace("'", "\\'");
    }

    private static JsonNode parse(String body) {
        return CloudHttp.parse(body);
    }

    private static String text(JsonNode node, String field) {
        return CloudHttp.text(node, field);
    }
}
