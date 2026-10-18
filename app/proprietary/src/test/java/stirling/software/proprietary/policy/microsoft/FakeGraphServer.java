package stirling.software.proprietary.policy.microsoft;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * An in-memory stand-in for the slice of Entra sign-in and Graph drives the policy engine uses. One
 * OneDrive ("drive-1"), reachable as {@link #USER}'s drive (app-only) or {@code /me/drive} (a
 * connected account), with files keyed by path and every item's id derived from its path, so
 * linked-folder addressing ({@code /items/{id}:/sub/path:}) works without bookkeeping. Sign-in
 * covers client credentials, authorization codes and rotating refresh tokens. Records which
 * requests carried a bearer token off-Graph, so tests can prove pre-authenticated URLs never get
 * one.
 */
public final class FakeGraphServer implements AutoCloseable {

    public static final String USER = "finance@contoso.com";
    public static final String DRIVE = "drive-1";
    public static final String APP_TOKEN = "fake-token";
    public static final String USER_TOKEN_PREFIX = "user-token-";
    public static final String GOOD_CODE = "good-code";

    private static final ObjectMapper JSON = new ObjectMapper();

    public final Map<String, byte[]> files = new ConcurrentHashMap<>();
    public final Map<String, Integer> versions = new ConcurrentHashMap<>();
    public final List<String> authorizedOffGraph = new CopyOnWriteArrayList<>();
    public final AtomicInteger tokenRequests = new AtomicInteger();
    public final AtomicInteger throttleNext = new AtomicInteger();
    public final Set<String> revokedRefreshTokens = ConcurrentHashMap.newKeySet();
    public final List<Map<String, String>> tokenForms = new CopyOnWriteArrayList<>();
    private final AtomicInteger refreshSerial = new AtomicInteger();
    private final AtomicInteger accessSerial = new AtomicInteger();
    private final Set<String> validUserTokens = ConcurrentHashMap.newKeySet();
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private final HttpServer server;

    private record Session(String path, ByteArrayOutputStream received) {}

    public FakeGraphServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", this::handle);
        server.start();
    }

    public String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    public GraphEndpoints endpoints() {
        return new GraphEndpoints(baseUrl() + "/v1.0", baseUrl() + "/login");
    }

    public void put(String path, String content) {
        put(path, content.getBytes(StandardCharsets.UTF_8));
    }

    public void put(String path, byte[] content) {
        files.put(path, content);
        versions.merge(path, 1, Integer::sum);
    }

    public String content(String path) {
        byte[] content = files.get(path);
        return content == null ? null : new String(content, StandardCharsets.UTF_8);
    }

    public static String id(String path) {
        return "id-"
                + Base64.getUrlEncoder()
                        .withoutPadding()
                        .encodeToString(path.getBytes(StandardCharsets.UTF_8));
    }

    private static String pathOf(String id) {
        return new String(Base64.getUrlDecoder().decode(id.substring(3)), StandardCharsets.UTF_8);
    }

    /** The link a user would paste for a folder in this drive. */
    public static String folderLink(String path) {
        return "https://contoso.sharepoint.com/:f:/s/Finance/" + id(path);
    }

    @Override
    public void close() {
        server.stop(0);
    }

    private void handle(HttpExchange exchange) throws IOException {
        try (exchange) {
            String path = exchange.getRequestURI().getPath();
            if (path.startsWith("/login/")) {
                token(exchange);
                return;
            }
            if (!path.startsWith("/v1.0/")) {
                if (exchange.getRequestHeaders().containsKey("Authorization")) {
                    authorizedOffGraph.add(path);
                }
                offGraph(exchange, path);
                return;
            }
            String auth = exchange.getRequestHeaders().getFirst("Authorization");
            boolean app = ("Bearer " + APP_TOKEN).equals(auth);
            boolean user = auth != null && validUserTokens.contains(auth.substring(7));
            if (!app && !user) {
                json(exchange, 401, error("InvalidAuthenticationToken", "no token"));
                return;
            }
            if (throttleNext.getAndUpdate(n -> Math.max(0, n - 1)) > 0) {
                exchange.getResponseHeaders().add("Retry-After", "0");
                json(exchange, 429, error("activityLimitReached", "slow down"));
                return;
            }
            graph(exchange, path.substring("/v1.0".length()), user);
        }
    }

    private void token(HttpExchange exchange) throws IOException {
        tokenRequests.incrementAndGet();
        Map<String, String> form = form(new String(read(exchange), StandardCharsets.UTF_8));
        tokenForms.add(form);
        String grant = form.get("grant_type");
        if ("client_credentials".equals(grant)) {
            json(exchange, 200, "{\"access_token\":\"" + APP_TOKEN + "\",\"expires_in\":3600}");
            return;
        }
        if (!"server-secret".equals(form.get("client_secret"))) {
            json(
                    exchange,
                    401,
                    "{\"error\":\"invalid_client\",\"error_description\":\"bad secret\"}");
            return;
        }
        if ("authorization_code".equals(grant)) {
            if (!GOOD_CODE.equals(form.get("code")) || form.get("code_verifier") == null) {
                json(exchange, 400, "{\"error\":\"invalid_grant\"}");
                return;
            }
            json(exchange, 200, userTokens(true));
            return;
        }
        if ("refresh_token".equals(grant)) {
            if (revokedRefreshTokens.contains(form.get("refresh_token"))) {
                json(
                        exchange,
                        400,
                        "{\"error\":\"invalid_grant\",\"error_description\":\"AADSTS700082: The"
                                + " refresh token has expired.\\nTrace ID: 1\"}");
                return;
            }
            json(exchange, 200, userTokens(false));
            return;
        }
        json(exchange, 400, "{\"error\":\"unsupported_grant_type\"}");
    }

    private String userTokens(boolean withIdentity) {
        String access = USER_TOKEN_PREFIX + accessSerial.incrementAndGet();
        validUserTokens.add(access);
        ObjectNode body = JSON.createObjectNode();
        body.put("access_token", access);
        body.put("refresh_token", "rt-" + refreshSerial.incrementAndGet());
        body.put("expires_in", 3600);
        body.put("scope", "Files.ReadWrite.All User.Read");
        if (withIdentity) {
            ObjectNode claims = JSON.createObjectNode();
            claims.put("oid", "user-oid");
            claims.put("tid", "tenant-guid");
            claims.put("preferred_username", "pat@contoso.com");
            claims.put("name", "Pat Example");
            body.put(
                    "id_token",
                    "e30."
                            + Base64.getUrlEncoder()
                                    .withoutPadding()
                                    .encodeToString(
                                            claims.toString().getBytes(StandardCharsets.UTF_8))
                            + ".sig");
        }
        return body.toString();
    }

    private void graph(HttpExchange exchange, String path, boolean user) throws IOException {
        String method = exchange.getRequestMethod();
        if (path.equals("/users/" + USER + "/drive") || (user && path.equals("/me/drive"))) {
            json(exchange, 200, "{\"id\":\"" + DRIVE + "\"}");
            return;
        }
        if (path.startsWith("/shares/") && path.endsWith("/driveItem")) {
            String token =
                    path.substring("/shares/u!".length(), path.length() - "/driveItem".length());
            String url = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            String folderId = url.substring(url.lastIndexOf('/') + 1);
            String folder = pathOf(folderId);
            if (!isFolder(folder)) {
                json(exchange, 404, error("itemNotFound", "link"));
                return;
            }
            ObjectNode item = JSON.createObjectNode();
            item.put("id", folderId);
            item.putObject("folder").put("childCount", 1);
            item.putObject("parentReference").put("driveId", DRIVE);
            json(exchange, 200, item.toString());
            return;
        }
        String prefix = "/drives/" + DRIVE;
        if (!path.startsWith(prefix)) {
            json(exchange, 404, error("itemNotFound", "drive"));
            return;
        }
        Addressed target = address(path.substring(prefix.length()));
        if (target == null) {
            json(exchange, 404, error("itemNotFound", path));
            return;
        }
        switch (target.suffix()) {
            case "/children" -> {
                if (!target.path().isEmpty() && !isFolder(target.path())) {
                    json(exchange, 404, error("itemNotFound", "folder"));
                    return;
                }
                json(exchange, 200, children(target.path()));
            }
            case "/content" -> {
                if (method.equals("PUT")) {
                    if (files.containsKey(target.path())) {
                        json(exchange, 409, error("nameAlreadyExists", "taken"));
                        return;
                    }
                    put(target.path(), read(exchange));
                    json(exchange, 201, item(target.path()).toString());
                } else if (files.containsKey(target.path())) {
                    exchange.getResponseHeaders()
                            .add("Location", baseUrl() + "/download/" + id(target.path()));
                    exchange.sendResponseHeaders(302, -1);
                } else {
                    json(exchange, 404, error("itemNotFound", "file"));
                }
            }
            case "/createUploadSession" -> {
                read(exchange);
                if (files.containsKey(target.path())) {
                    json(exchange, 409, error("nameAlreadyExists", "taken"));
                    return;
                }
                String session = "session-" + sessions.size();
                sessions.put(session, new Session(target.path(), new ByteArrayOutputStream()));
                json(exchange, 200, "{\"uploadUrl\":\"" + baseUrl() + "/upload/" + session + "\"}");
            }
            case "" -> {
                if (!files.containsKey(target.path())) {
                    json(exchange, 404, error("itemNotFound", "item"));
                } else if (method.equals("DELETE")) {
                    String ifMatch = exchange.getRequestHeaders().getFirst("If-Match");
                    if (ifMatch != null && !ifMatch.equals(eTag(target.path()))) {
                        json(exchange, 412, error("preconditionFailed", "changed"));
                        return;
                    }
                    files.remove(target.path());
                    exchange.sendResponseHeaders(204, -1);
                } else {
                    json(exchange, 200, item(target.path()).toString());
                }
            }
            default -> json(exchange, 404, error("itemNotFound", target.suffix()));
        }
    }

    private record Addressed(String path, String suffix) {}

    /** Reads {@code /root[:/p:]}, {@code /items/{id}[:/p:]} plus an optional suffix. */
    private static Addressed address(String rest) {
        String base;
        String remainder;
        if (rest.startsWith("/root")) {
            base = "";
            remainder = rest.substring("/root".length());
        } else if (rest.startsWith("/items/")) {
            String afterItems = rest.substring("/items/".length());
            int end = afterItems.length();
            for (int i = 0; i < afterItems.length(); i++) {
                char c = afterItems.charAt(i);
                if (c == '/' || c == ':') {
                    end = i;
                    break;
                }
            }
            base = pathOf(afterItems.substring(0, end));
            remainder = afterItems.substring(end);
        } else {
            return null;
        }
        String path = base;
        if (remainder.startsWith(":/")) {
            int close = remainder.indexOf(':', 2);
            if (close < 0) {
                return null;
            }
            String relative = remainder.substring(2, close);
            path = base.isEmpty() ? relative : base + "/" + relative;
            remainder = remainder.substring(close + 1);
        }
        return new Addressed(path, remainder);
    }

    private void offGraph(HttpExchange exchange, String path) throws IOException {
        if (path.startsWith("/download/")) {
            byte[] content = files.get(pathOf(path.substring("/download/".length())));
            if (content == null) {
                exchange.sendResponseHeaders(404, -1);
                return;
            }
            exchange.sendResponseHeaders(200, content.length);
            exchange.getResponseBody().write(content);
            return;
        }
        if (path.startsWith("/upload/")) {
            Session session = sessions.get(path.substring("/upload/".length()));
            if (session == null || exchange.getRequestMethod().equals("DELETE")) {
                exchange.sendResponseHeaders(session == null ? 404 : 204, -1);
                return;
            }
            session.received().write(read(exchange));
            String range = exchange.getRequestHeaders().getFirst("Content-Range");
            long total = Long.parseLong(range.substring(range.indexOf('/') + 1));
            if (session.received().size() < total) {
                json(exchange, 202, "{}");
                return;
            }
            put(session.path(), session.received().toByteArray());
            json(exchange, 201, item(session.path()).toString());
            return;
        }
        exchange.sendResponseHeaders(404, -1);
    }

    private boolean isFolder(String folder) {
        return folder.isEmpty()
                || files.keySet().stream().anyMatch(p -> p.startsWith(folder + "/"));
    }

    private String children(String folder) {
        String prefix = folder.isEmpty() ? "" : folder + "/";
        Map<String, ObjectNode> entries = new TreeMap<>();
        for (String path : files.keySet()) {
            if (!path.startsWith(prefix)) {
                continue;
            }
            String remainder = path.substring(prefix.length());
            int slash = remainder.indexOf('/');
            if (slash < 0) {
                entries.put(remainder, item(path));
            } else {
                String name = remainder.substring(0, slash);
                ObjectNode node = JSON.createObjectNode();
                node.put("id", id(prefix + name));
                node.put("name", name);
                node.putObject("folder").put("childCount", 1);
                entries.putIfAbsent(name, node);
            }
        }
        ObjectNode page = JSON.createObjectNode();
        ArrayNode value = page.putArray("value");
        new ArrayList<>(entries.values()).forEach(value::add);
        return page.toString();
    }

    private String eTag(String path) {
        return "\"{" + id(path) + "}," + versions.getOrDefault(path, 1) + "\"";
    }

    private ObjectNode item(String path) {
        byte[] content = files.get(path);
        QuickXorHash hash = new QuickXorHash();
        hash.update(content, 0, content.length);
        ObjectNode node = JSON.createObjectNode();
        node.put("id", id(path));
        node.put("name", path.substring(path.lastIndexOf('/') + 1));
        node.put("size", content.length);
        node.put("eTag", eTag(path));
        node.put("cTag", "\"c:" + eTag(path) + "\"");
        node.putObject("file").putObject("hashes").put("quickXorHash", hash.digestBase64());
        return node;
    }

    private static Map<String, String> form(String body) {
        Map<String, String> form = new HashMap<>();
        for (String pair : body.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0) {
                form.put(
                        URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                        URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
            }
        }
        return form;
    }

    private static byte[] read(HttpExchange exchange) throws IOException {
        try (InputStream in = exchange.getRequestBody()) {
            return in.readAllBytes();
        }
    }

    private static String error(String code, String message) {
        return "{\"error\":{\"code\":\"" + code + "\",\"message\":\"" + message + "\"}}";
    }

    private static void json(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}
