package stirling.software.proprietary.policy.google;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.util.Base64;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

public final class FakeGoogleServer implements AutoCloseable {

    public static final String GOOD_CODE = "google-code";
    public static final String CLIENT_SECRET = "google-secret";
    public static final String SERVICE_EMAIL = "stirling@project.iam.gserviceaccount.com";

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern QUERY_NAME = Pattern.compile("name = '((?:[^'\\\\]|\\\\.)*)'");
    private static final Pattern QUERY_PARENT = Pattern.compile("'([^']+)' in parents");

    public final Map<String, Item> items = new ConcurrentHashMap<>();
    public final KeyPair serviceAccountKeys;
    public final List<JsonNode> assertions = new CopyOnWriteArrayList<>();
    public final AtomicInteger uploads = new AtomicInteger();
    private final AtomicInteger ids = new AtomicInteger();
    private final java.util.Set<String> validTokens = ConcurrentHashMap.newKeySet();
    private final Map<String, Resumable> resumables = new ConcurrentHashMap<>();
    private final HttpServer server;

    public static final class Item {
        public final String id;
        public final String parent;
        public final String name;
        public final boolean folder;
        public volatile byte[] content;
        public volatile int version = 1;
        public volatile boolean trashed;

        Item(String id, String parent, String name, boolean folder, byte[] content) {
            this.id = id;
            this.parent = parent;
            this.name = name;
            this.folder = folder;
            this.content = content;
        }
    }

    private record Resumable(String parent, String name, ByteArrayOutputStream received) {}

    public FakeGoogleServer() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        serviceAccountKeys = generator.generateKeyPair();
        items.put("root", new Item("root", null, "My Drive", true, null));
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", this::handle);
        server.start();
    }

    public String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    public GoogleEndpoints endpoints() {
        return new GoogleEndpoints(
                baseUrl() + "/o/oauth2/v2/auth",
                baseUrl() + "/token",
                baseUrl() + "/revoke",
                baseUrl() + "/drive/v3",
                baseUrl() + "/upload/drive/v3");
    }

    public String serviceAccountJson() {
        String pem =
                "-----BEGIN PRIVATE KEY-----\n"
                        + Base64.getMimeEncoder()
                                .encodeToString(serviceAccountKeys.getPrivate().getEncoded())
                        + "\n-----END PRIVATE KEY-----\n";
        ObjectNode key = JSON.createObjectNode();
        key.put("type", "service_account");
        key.put("client_email", SERVICE_EMAIL);
        key.put("private_key", pem);
        key.put("token_uri", "https://evil.example/token");
        return key.toString();
    }

    public String folder(String parent, String name) {
        String id = "fld" + ids.incrementAndGet() + "xxxxxxxx";
        items.put(id, new Item(id, parent, name, true, null));
        return id;
    }

    public String file(String parent, String name, String content) {
        String id = "fil" + ids.incrementAndGet() + "xxxxxxxx";
        items.put(id, new Item(id, parent, name, false, content.getBytes(StandardCharsets.UTF_8)));
        return id;
    }

    public Item named(String parent, String name) {
        return items.values().stream()
                .filter(i -> !i.trashed && name.equals(i.name) && parent.equals(i.parent))
                .findFirst()
                .orElse(null);
    }

    @Override
    public void close() {
        server.stop(0);
    }

    private void handle(HttpExchange exchange) throws IOException {
        try (exchange) {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/token")) {
                token(exchange);
                return;
            }
            if (path.equals("/revoke")) {
                read(exchange);
                exchange.sendResponseHeaders(200, -1);
                return;
            }
            String auth = exchange.getRequestHeaders().getFirst("Authorization");
            if (auth == null || !validTokens.contains(auth.substring(7))) {
                json(exchange, 401, "{\"error\":{\"message\":\"Invalid Credentials\"}}");
                return;
            }
            Map<String, String> query = query(exchange.getRequestURI().getRawQuery());
            if (path.startsWith("/upload/drive/v3/files")) {
                upload(exchange, path, query);
            } else if (path.equals("/drive/v3/files")) {
                list(exchange, query);
            } else if (path.startsWith("/drive/v3/files/")) {
                item(exchange, path.substring("/drive/v3/files/".length()), query);
            } else {
                json(exchange, 404, "{\"error\":{\"message\":\"not found\"}}");
            }
        }
    }

    private void token(HttpExchange exchange) throws IOException {
        Map<String, String> form = query(new String(read(exchange), StandardCharsets.UTF_8));
        String grant = form.get("grant_type");
        if ("urn:ietf:params:oauth:grant-type:jwt-bearer".equals(grant)) {
            JsonNode claims = verify(form.get("assertion"));
            if (claims == null) {
                json(
                        exchange,
                        400,
                        "{\"error\":\"invalid_grant\",\"error_description\":\"bad sig\"}");
                return;
            }
            assertions.add(claims);
            json(exchange, 200, accessToken(null));
            return;
        }
        if (!CLIENT_SECRET.equals(form.get("client_secret"))) {
            json(exchange, 401, "{\"error\":\"invalid_client\"}");
            return;
        }
        if ("authorization_code".equals(grant) && GOOD_CODE.equals(form.get("code"))) {
            ObjectNode claims = JSON.createObjectNode();
            claims.put("sub", "google-sub-1");
            claims.put("email", "pat@gmail.com");
            claims.put("name", "Pat");
            String idToken =
                    "e30."
                            + Base64.getUrlEncoder()
                                    .withoutPadding()
                                    .encodeToString(
                                            claims.toString().getBytes(StandardCharsets.UTF_8))
                            + ".sig";
            json(exchange, 200, accessToken(idToken));
            return;
        }
        if ("refresh_token".equals(grant) && "google-refresh".equals(form.get("refresh_token"))) {
            json(exchange, 200, accessToken(null));
            return;
        }
        json(exchange, 400, "{\"error\":\"invalid_grant\"}");
    }

    private String accessToken(String idToken) {
        String token = "gtoken-" + ids.incrementAndGet();
        validTokens.add(token);
        ObjectNode body = JSON.createObjectNode();
        body.put("access_token", token);
        body.put("expires_in", 3600);
        if (idToken != null) {
            body.put("id_token", idToken);
            body.put("refresh_token", "google-refresh");
        }
        return body.toString();
    }

    private JsonNode verify(String assertion) {
        try {
            String[] parts = assertion.split("\\.");
            Signature verifier = Signature.getInstance("SHA256withRSA");
            verifier.initVerify(serviceAccountKeys.getPublic());
            verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
            if (!verifier.verify(Base64.getUrlDecoder().decode(parts[2]))) {
                return null;
            }
            return JSON.readTree(Base64.getUrlDecoder().decode(parts[1]));
        } catch (Exception e) {
            return null;
        }
    }

    private void list(HttpExchange exchange, Map<String, String> query) throws IOException {
        String q = query.getOrDefault("q", "");
        Matcher parentMatch = QUERY_PARENT.matcher(q);
        String parent = parentMatch.find() ? parentMatch.group(1) : null;
        Matcher nameMatch = QUERY_NAME.matcher(q);
        String name = nameMatch.find() ? nameMatch.group(1).replace("\\'", "'") : null;
        boolean foldersOnly = q.contains("mimeType = 'application/vnd.google-apps.folder'");
        ObjectNode page = JSON.createObjectNode();
        ArrayNode files = page.putArray("files");
        items.values().stream()
                .filter(i -> !i.trashed && !"root".equals(i.id))
                .filter(i -> parent == null || parent.equals(i.parent))
                .filter(i -> name == null || name.equals(i.name))
                .filter(i -> !foldersOnly || i.folder)
                .sorted((a, b) -> a.name.compareTo(b.name))
                .forEach(i -> files.add(describe(i)));
        json(exchange, 200, page.toString());
    }

    private void item(HttpExchange exchange, String id, Map<String, String> query)
            throws IOException {
        Item item = items.get(id);
        if (item == null) {
            json(exchange, 404, "{\"error\":{\"message\":\"File not found\"}}");
            return;
        }
        if ("PATCH".equals(exchange.getRequestMethod())) {
            JsonNode body = JSON.readTree(read(exchange));
            item.trashed = body.path("trashed").asBoolean(false);
            json(exchange, 200, describe(item).toString());
        } else if ("media".equals(query.get("alt"))) {
            exchange.sendResponseHeaders(200, item.content.length);
            exchange.getResponseBody().write(item.content);
        } else {
            ObjectNode node = describe(item);
            node.put("trashed", item.trashed);
            json(exchange, 200, node.toString());
        }
    }

    private void upload(HttpExchange exchange, String path, Map<String, String> query)
            throws IOException {
        if (path.startsWith("/upload/drive/v3/files/session-")) {
            Resumable session = resumables.get(path.substring("/upload/drive/v3/files/".length()));
            session.received().write(read(exchange));
            String range = exchange.getRequestHeaders().getFirst("Content-Range");
            long total = Long.parseLong(range.substring(range.indexOf('/') + 1));
            if (session.received().size() < total) {
                exchange.sendResponseHeaders(308, -1);
                return;
            }
            json(
                    exchange,
                    200,
                    describe(
                                    store(
                                            session.parent(),
                                            session.name(),
                                            session.received().toByteArray()))
                            .toString());
            return;
        }
        byte[] body = read(exchange);
        if ("resumable".equals(query.get("uploadType"))) {
            JsonNode metadata = JSON.readTree(body);
            String session = "session-" + ids.incrementAndGet();
            resumables.put(
                    session,
                    new Resumable(
                            metadata.path("parents").get(0).asString(),
                            metadata.path("name").asString(),
                            new ByteArrayOutputStream()));
            exchange.getResponseHeaders()
                    .add("Location", baseUrl() + "/upload/drive/v3/files/" + session);
            exchange.sendResponseHeaders(200, -1);
            return;
        }
        String contentType = exchange.getRequestHeaders().getFirst("Content-Type");
        String boundary = "--" + contentType.substring(contentType.indexOf("boundary=") + 9);
        String text = new String(body, StandardCharsets.ISO_8859_1);
        String[] parts = text.split(java.util.regex.Pattern.quote(boundary));
        String metadataPart = parts[1].substring(parts[1].indexOf("\r\n\r\n") + 4).trim();
        String contentPart = parts[2].substring(parts[2].indexOf("\r\n\r\n") + 4);
        contentPart = contentPart.substring(0, contentPart.length() - 2);
        JsonNode metadata = JSON.readTree(metadataPart);
        Item stored =
                store(
                        metadata.path("parents").get(0).asString(),
                        metadata.path("name").asString(),
                        contentPart.getBytes(StandardCharsets.ISO_8859_1));
        json(exchange, 200, describe(stored).toString());
    }

    private Item store(String parent, String name, byte[] content) {
        uploads.incrementAndGet();
        String id = "fil" + ids.incrementAndGet() + "xxxxxxxx";
        Item item = new Item(id, parent, name, false, content);
        items.put(id, item);
        return item;
    }

    private static ObjectNode describe(Item item) {
        ObjectNode node = JSON.createObjectNode();
        node.put("id", item.id);
        node.put("name", item.name);
        node.putArray("parents").add(item.parent == null ? "" : item.parent);
        if (item.folder) {
            node.put("mimeType", "application/vnd.google-apps.folder");
        } else {
            node.put("mimeType", "application/pdf");
            node.put("size", String.valueOf(item.content.length));
            node.put("md5Checksum", md5(item.content));
            node.put("version", String.valueOf(item.version));
        }
        return node;
    }

    private static String md5(byte[] content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest(content));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static Map<String, String> query(String raw) {
        Map<String, String> params = new HashMap<>();
        if (raw == null) {
            return params;
        }
        for (String pair : raw.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0) {
                params.put(
                        URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                        URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
            }
        }
        return params;
    }

    private static byte[] read(HttpExchange exchange) throws IOException {
        try (InputStream in = exchange.getRequestBody()) {
            return in.readAllBytes();
        }
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
