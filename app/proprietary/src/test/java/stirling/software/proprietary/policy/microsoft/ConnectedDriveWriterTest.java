package stirling.software.proprietary.policy.microsoft;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import stirling.software.proprietary.connectedaccount.ConnectedAccountService;

class ConnectedDriveWriterTest {

    private static final String SAVED_ITEM =
            "{\"id\":\"item-1\",\"parentReference\":{\"driveId\":\"drive-1\"}}";
    private static final String SAVED_DETAILS =
            "{\"id\":\"item-1\",\"name\":\"Report.pdf\",\"eTag\":\"\\\"{E},2\\\"\","
                    + "\"webUrl\":\"https://contoso/Report.pdf\","
                    + "\"parentReference\":{\"driveId\":\"drive-1\",\"id\":\"folder-1\"}}";

    record Seen(String method, String uri, String ifMatch, String auth, String range, int size) {}

    @TempDir Path temp;

    private HttpServer server;
    private final List<Seen> seen = new CopyOnWriteArrayList<>();
    private Function<Seen, Response> respond;
    private ConnectedDriveWriter writer;

    record Response(int status, String body) {}

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", this::handle);
        server.start();
        String base = "http://127.0.0.1:" + server.getAddress().getPort();
        ConnectedAccountService accounts = mock(ConnectedAccountService.class);
        when(accounts.accessToken(eq(33L), anyList())).thenReturn("write-token");
        writer =
                new ConnectedDriveWriter(
                        new GraphEndpoints(base + "/v1.0", base),
                        accounts,
                        HttpClient.newHttpClient());
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void replacingSendsTheEtagSoANewerVersionIsNeverOverwritten() throws IOException {
        respond =
                request ->
                        request.method().equals("PUT")
                                ? new Response(200, SAVED_ITEM)
                                : new Response(200, SAVED_DETAILS);

        ConnectedDriveWriter.SavedItem saved =
                writer.save(
                        33L,
                        new ConnectedDriveWriter.Replace("drive-1", "item-1", "\"{E},1\""),
                        file(10));

        Seen put = seen.getFirst();
        assertThat(put.method()).isEqualTo("PUT");
        assertThat(put.uri()).isEqualTo("/v1.0/drives/drive-1/items/item-1/content");
        assertThat(put.ifMatch()).isEqualTo("\"{E},1\"");
        assertThat(put.auth()).isEqualTo("Bearer write-token");
        assertThat(put.size()).isEqualTo(10);
        assertThat(saved.eTag()).isEqualTo("\"{E},2\"");
        assertThat(saved.parentId()).isEqualTo("folder-1");
        assertThat(saved.webUrl()).isEqualTo("https://contoso/Report.pdf");
    }

    @Test
    void aChangedFileIsAConflictNotAnOverwrite() throws IOException {
        respond = request -> new Response(412, "{\"error\":{\"code\":\"resourceModified\"}}");

        assertThatThrownBy(
                        () ->
                                writer.save(
                                        33L,
                                        new ConnectedDriveWriter.Replace(
                                                "drive-1", "item-1", "\"{E},1\""),
                                        file(10)))
                .isInstanceOf(ConnectedDriveWriter.ConflictException.class);
    }

    @Test
    void creatingAFileRenamesRatherThanReplacingAnExistingOne() throws IOException {
        respond =
                request ->
                        request.method().equals("PUT")
                                ? new Response(201, SAVED_ITEM)
                                : new Response(200, SAVED_DETAILS);

        writer.save(
                33L,
                new ConnectedDriveWriter.Create("drive-1", "folder-1", "Board report.pdf", true),
                file(10));

        Seen put = seen.getFirst();
        assertThat(put.uri())
                .isEqualTo(
                        "/v1.0/drives/drive-1/items/folder-1:/Board%20report.pdf:/content"
                                + "?@microsoft.graph.conflictBehavior=rename");
        assertThat(put.ifMatch()).isNull();
    }

    @Test
    void largeFilesGoThroughAnUploadSessionInChunks() throws IOException {
        int size = (int) GraphDriveClient.SIMPLE_UPLOAD_LIMIT + GraphDriveClient.UPLOAD_CHUNK + 5;
        String base = "http://127.0.0.1:" + server.getAddress().getPort();
        respond =
                request -> {
                    if (request.method().equals("POST")) {
                        return new Response(
                                200, "{\"uploadUrl\":\"" + base + "/upload/session-1\"}");
                    }
                    if (request.uri().startsWith("/upload/")) {
                        boolean last = request.range().endsWith((size - 1) + "/" + size);
                        return last
                                ? new Response(201, SAVED_ITEM)
                                : new Response(202, "{\"nextExpectedRanges\":[]}");
                    }
                    return new Response(200, SAVED_DETAILS);
                };

        writer.save(
                33L,
                new ConnectedDriveWriter.Replace("drive-1", "item-1", "\"{E},1\""),
                file(size));

        assertThat(seen.getFirst().uri())
                .isEqualTo("/v1.0/drives/drive-1/items/item-1/createUploadSession");
        assertThat(seen.getFirst().ifMatch()).isEqualTo("\"{E},1\"");
        List<Seen> chunks = seen.stream().filter(s -> s.uri().startsWith("/upload/")).toList();
        assertThat(chunks).hasSize(2);
        assertThat(chunks.get(0).auth()).isNull();
        assertThat(chunks.stream().mapToInt(Seen::size).sum()).isEqualTo(size);
    }

    private Path file(int size) throws IOException {
        Path path = Files.createTempFile(temp, "content-", ".pdf");
        Files.write(path, new byte[size]);
        return path;
    }

    private void handle(HttpExchange exchange) throws IOException {
        byte[] body = exchange.getRequestBody().readAllBytes();
        Seen request =
                new Seen(
                        exchange.getRequestMethod(),
                        exchange.getRequestURI().toString(),
                        exchange.getRequestHeaders().getFirst("If-Match"),
                        exchange.getRequestHeaders().getFirst("Authorization"),
                        exchange.getRequestHeaders().getFirst("Content-Range"),
                        body.length);
        seen.add(request);
        Response response = respond.apply(request);
        byte[] out = response.body().getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(response.status(), out.length);
        exchange.getResponseBody().write(out);
        exchange.close();
    }
}
