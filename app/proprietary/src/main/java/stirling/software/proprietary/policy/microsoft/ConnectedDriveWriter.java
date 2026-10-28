package stirling.software.proprietary.policy.microsoft;

import java.io.IOException;
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
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.connectedaccount.ConnectedAccountService;
import stirling.software.proprietary.policy.remote.CloudHttp;

import tools.jackson.databind.JsonNode;

@Slf4j
@Component
public class ConnectedDriveWriter {

    private static final long SIMPLE_UPLOAD_LIMIT = GraphDriveClient.SIMPLE_UPLOAD_LIMIT;
    private static final int UPLOAD_CHUNK = GraphDriveClient.UPLOAD_CHUNK;
    private static final String ITEM_FIELDS = "id,name,eTag,webUrl,parentReference";

    private final GraphEndpoints endpoints;
    private final ConnectedAccountService accounts;
    private final HttpClient http;

    @Autowired
    public ConnectedDriveWriter(GraphEndpoints endpoints, ConnectedAccountService accounts) {
        this(endpoints, accounts, CloudHttp.newClient());
    }

    ConnectedDriveWriter(
            GraphEndpoints endpoints, ConnectedAccountService accounts, HttpClient http) {
        this.endpoints = endpoints;
        this.accounts = accounts;
        this.http = http;
    }

    public sealed interface Target permits Replace, Create {}

    public record Replace(String driveId, String itemId, String eTag) implements Target {}

    public record Create(String driveId, String parentId, String name, boolean renameOnConflict)
            implements Target {}

    public record SavedItem(
            String driveId,
            String itemId,
            String parentId,
            String name,
            String eTag,
            String webUrl) {}

    public static class ConflictException extends IOException {
        public ConflictException(String message) {
            super(message);
        }
    }

    public SavedItem save(long accountId, Target target, Path content) throws IOException {
        String token = accounts.accessToken(accountId, List.of());
        long size = Files.size(content);
        if (size <= SIMPLE_UPLOAD_LIMIT) {
            HttpRequest.Builder request =
                    authorized(token, contentUrl(target))
                            .header("Content-Type", "application/octet-stream")
                            .PUT(HttpRequest.BodyPublishers.ofFile(content));
            ifMatch(request, target);
            HttpResponse<String> response = send(request.build());
            requireNoConflict(response, target);
            requireSuccess(response, "save " + describe(target));
            return fetch(token, parse(response.body()));
        }
        return saveInSession(token, target, content, size);
    }

    private SavedItem saveInSession(String token, Target target, Path content, long size)
            throws IOException {
        HttpRequest.Builder start =
                authorized(token, sessionUrl(target))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(sessionBody(target)));
        ifMatch(start, target);
        HttpResponse<String> created = send(start.build());
        requireNoConflict(created, target);
        requireSuccess(created, "start saving " + describe(target));
        String uploadUrl = text(parse(created.body()), "uploadUrl");
        if (uploadUrl == null) {
            throw new IOException("Microsoft Graph returned no upload URL");
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
                                        .build());
                offset += length;
                if (chunk.statusCode() >= 300) {
                    cancelSession(uploadUrl);
                    requireNoConflict(chunk, target);
                    requireSuccess(chunk, "save " + describe(target));
                }
                if (offset >= size) {
                    return fetch(token, parse(chunk.body()));
                }
            }
        }
        throw new IOException("Saving " + describe(target) + " ended without a completed item");
    }

    private SavedItem fetch(String token, JsonNode item) throws IOException {
        String driveId = text(item.path("parentReference"), "driveId");
        String itemId = text(item, "id");
        if (driveId == null || itemId == null) {
            throw new IOException("Microsoft Graph returned no saved item");
        }
        HttpResponse<String> response =
                send(
                        authorized(
                                        token,
                                        endpoints.graphUrl()
                                                + "/drives/"
                                                + segment(driveId)
                                                + "/items/"
                                                + segment(itemId)
                                                + "?$select="
                                                + ITEM_FIELDS)
                                .GET()
                                .build());
        requireSuccess(response, "read the saved file");
        JsonNode saved = parse(response.body());
        return new SavedItem(
                driveId,
                itemId,
                text(saved.path("parentReference"), "id"),
                text(saved, "name"),
                text(saved, "eTag"),
                text(saved, "webUrl"));
    }

    private String contentUrl(Target target) {
        return switch (target) {
            case Replace replace -> itemUrl(replace.driveId(), replace.itemId()) + "/content";
            case Create create ->
                    childUrl(create)
                            + ":/content?@microsoft.graph.conflictBehavior="
                            + (create.renameOnConflict() ? "rename" : "fail");
        };
    }

    private String sessionUrl(Target target) {
        return switch (target) {
            case Replace replace ->
                    itemUrl(replace.driveId(), replace.itemId()) + "/createUploadSession";
            case Create create -> childUrl(create) + ":/createUploadSession";
        };
    }

    private static String sessionBody(Target target) {
        return switch (target) {
            case Replace replace ->
                    "{\"item\":{\"@microsoft.graph.conflictBehavior\":\"replace\"}}";
            case Create create ->
                    "{\"item\":{\"@microsoft.graph.conflictBehavior\":\""
                            + (create.renameOnConflict() ? "rename" : "fail")
                            + "\"}}";
        };
    }

    private String itemUrl(String driveId, String itemId) {
        return endpoints.graphUrl() + "/drives/" + segment(driveId) + "/items/" + segment(itemId);
    }

    private String childUrl(Create create) {
        return itemUrl(create.driveId(), create.parentId()) + ":/" + segment(create.name());
    }

    private static void ifMatch(HttpRequest.Builder request, Target target) {
        if (target instanceof Replace replace
                && replace.eTag() != null
                && !replace.eTag().isBlank()) {
            request.header("If-Match", replace.eTag());
        }
    }

    private static void requireNoConflict(HttpResponse<String> response, Target target)
            throws ConflictException {
        int status = response.statusCode();
        if (status == 412 || status == 409) {
            throw new ConflictException(
                    target instanceof Replace
                            ? "The file changed in OneDrive since it was opened"
                            : "A file with that name already exists in the folder");
        }
    }

    private static String describe(Target target) {
        return switch (target) {
            case Replace replace -> "the OneDrive file";
            case Create create -> create.name();
        };
    }

    private HttpRequest.Builder authorized(String token, String url) {
        return HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofMinutes(2))
                .header("Authorization", "Bearer " + token)
                .header("Accept", "application/json");
    }

    private HttpResponse<String> send(HttpRequest request) throws IOException {
        return CloudHttp.send(
                http, request, HttpResponse.BodyHandlers.ofString(), "Microsoft Graph");
    }

    private void cancelSession(String uploadUrl) {
        try {
            CloudHttp.send(
                    http,
                    HttpRequest.newBuilder(URI.create(uploadUrl)).DELETE().build(),
                    HttpResponse.BodyHandlers.discarding(),
                    "Microsoft Graph");
        } catch (IOException e) {
            log.debug("Could not cancel upload session: {}", e.getMessage());
        }
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
        throw new IOException(
                "Could not "
                        + action
                        + ": HTTP "
                        + status
                        + (code == null ? "" : " " + code)
                        + (message == null ? "" : " - " + message));
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
