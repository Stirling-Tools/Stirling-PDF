package stirling.software.proprietary.security.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;

import jakarta.ws.rs.core.Response;

import stirling.software.common.configuration.RuntimePathConfig;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Migration (Spring MockMvc -> direct JAX-RS calls): {@code UIDataTessdataController} now returns
 * {@code jakarta.ws.rs.core.Response} with HTTP statuses expressed via {@link Response.Status} /
 * numeric codes (207 Multi-Status, 502 Bad Gateway). The {@code download} endpoint binds a typed
 * request DTO that is a {@code private static} nested class, so it is built by deserializing JSON
 * via the project {@link JsonMapper} and the endpoint is invoked reflectively; the JSON download
 * responses are plain {@code Map} entities asserted directly. The {@code tessdata-languages}
 * endpoint returns a private response DTO that is converted to a {@code Map} for assertions. The
 * {@code protected} test seams ({@code getRemoteTessdataLanguages}, {@code downloadLanguageFile},
 * {@code isWritableDirectory}) are still overridden via anonymous subclasses.
 */
class UIDataTessdataControllerTest {

    private static final ObjectMapper MAPPER = JsonMapper.builder().build();

    private static RuntimePathConfig pathConfig(String tessDataPath) {
        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn(tessDataPath);
        return runtimePathConfig;
    }

    /**
     * Build the {@code TessdataDownloadRequest} (a private nested type) from JSON and invoke the
     * public {@code downloadTessdataLanguages} method reflectively.
     */
    private static Response download(UIDataTessdataController controller, String json)
            throws Exception {
        Class<?> requestType =
                Class.forName(
                        "stirling.software.proprietary.security.controller.api"
                                + ".UIDataTessdataController$TessdataDownloadRequest");
        Object request = MAPPER.readValue(json, requestType);
        Method method =
                UIDataTessdataController.class.getDeclaredMethod(
                        "downloadTessdataLanguages", requestType);
        method.setAccessible(true);
        return (Response) method.invoke(controller, request);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Response response) {
        Object entity = response.getEntity();
        if (entity instanceof Map) {
            return (Map<String, Object>) entity;
        }
        // Private response DTO (TessdataLanguagesResponse) -> convert via getters.
        return MAPPER.convertValue(entity, Map.class);
    }

    @SuppressWarnings("unchecked")
    private static List<Object> list(Map<String, Object> map, String key) {
        return (List<Object>) map.get(key);
    }

    @Test
    void downloadTessdataLanguages_withEmptyList_returnsBadRequest() throws Exception {
        UIDataTessdataController controller =
                new UIDataTessdataController(pathConfig("ignored/path"), MAPPER) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };

        Response response = download(controller, "{\"languages\":[]}");

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        assertEquals("No languages provided for download", map(response).get("message"));
    }

    @Test
    void downloadTessdataLanguages_blocksPathTraversal(@TempDir Path tempDir) throws Exception {
        UIDataTessdataController controller =
                new UIDataTessdataController(pathConfig(tempDir.toString()), MAPPER) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };

        Response response = download(controller, "{\"languages\":[\"../evil\"]}");

        assertEquals(Response.Status.BAD_GATEWAY.getStatusCode(), response.getStatus());
        assertTrue(list(map(response), "downloaded").isEmpty());
        assertEquals("../evil", list(map(response), "failed").get(0));

        // Ensure no file was written outside the tessdata directory
        Path escapedPath = tempDir.resolve("../evil.traineddata").normalize();
        assertTrue(Files.notExists(escapedPath), "Traversal path should not be written");
    }

    @Test
    void downloadTessdataLanguages_rejectsUnknownLanguage(@TempDir Path tempDir) throws Exception {
        UIDataTessdataController controller =
                new UIDataTessdataController(pathConfig(tempDir.toString()), MAPPER) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };

        Response response = download(controller, "{\"languages\":[\"fra\"]}");

        assertEquals(Response.Status.BAD_GATEWAY.getStatusCode(), response.getStatus());
        assertTrue(list(map(response), "downloaded").isEmpty());
        assertEquals("fra", list(map(response), "failed").get(0));
    }

    @Test
    void downloadTessdataLanguages_successAndFailureMixed(@TempDir Path tempDir) throws Exception {
        UIDataTessdataController controller =
                new UIDataTessdataController(pathConfig(tempDir.toString()), MAPPER) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng", "fra");
                    }

                    @Override
                    protected boolean downloadLanguageFile(
                            String safeLang, Path targetFile, String downloadUrl) {
                        if ("eng".equals(safeLang)) {
                            try {
                                Files.writeString(targetFile, "dummy");
                                return true;
                            } catch (Exception e) {
                                return false;
                            }
                        }
                        return false;
                    }
                };

        Response response = download(controller, "{\"languages\":[\"eng\",\"fra\"]}");

        assertEquals(207, response.getStatus());
        assertEquals("eng", list(map(response), "downloaded").get(0));
        assertEquals("fra", list(map(response), "failed").get(0));
    }

    @Test
    void downloadTessdataLanguages_handlesInvalidSanitizedLanguage(@TempDir Path tempDir)
            throws Exception {
        UIDataTessdataController controller =
                new UIDataTessdataController(pathConfig(tempDir.toString()), MAPPER) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };

        Response response = download(controller, "{\"languages\":[\"eng/\"]}");

        assertEquals(Response.Status.BAD_GATEWAY.getStatusCode(), response.getStatus());
        assertTrue(list(map(response), "downloaded").isEmpty());
        assertEquals("eng/", list(map(response), "failed").get(0));
    }

    @Test
    void downloadTessdataLanguages_returnsForbiddenWhenNotWritable(@TempDir Path tempDir)
            throws Exception {
        UIDataTessdataController controller =
                new UIDataTessdataController(pathConfig(tempDir.toString()), MAPPER) {
                    @Override
                    protected boolean isWritableDirectory(Path dir) {
                        return false;
                    }
                };

        Response response = download(controller, "{\"languages\":[\"eng\"]}");

        assertEquals(Response.Status.FORBIDDEN.getStatusCode(), response.getStatus());
    }

    @Test
    void downloadTessdataLanguages_handlesNetworkFailure(@TempDir Path tempDir) throws Exception {
        UIDataTessdataController controller =
                new UIDataTessdataController(pathConfig(tempDir.toString()), MAPPER) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }

                    @Override
                    protected boolean downloadLanguageFile(
                            String safeLang, Path targetFile, String downloadUrl) {
                        return false; // simulate network failure
                    }
                };

        Response response = download(controller, "{\"languages\":[\"eng\"]}");

        assertEquals(Response.Status.BAD_GATEWAY.getStatusCode(), response.getStatus());
        assertTrue(list(map(response), "downloaded").isEmpty());
        assertEquals("eng", list(map(response), "failed").get(0));
    }

    @Test
    void downloadTessdataLanguages_allSuccess(@TempDir Path tempDir) throws Exception {
        UIDataTessdataController controller =
                new UIDataTessdataController(pathConfig(tempDir.toString()), MAPPER) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }

                    @Override
                    protected boolean downloadLanguageFile(
                            String safeLang, Path targetFile, String downloadUrl) {
                        try {
                            Files.writeString(targetFile, "dummy");
                            return true;
                        } catch (IOException e) {
                            return false;
                        }
                    }
                };

        Response response = download(controller, "{\"languages\":[\"eng\"]}");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals("eng", list(map(response), "downloaded").get(0));
        assertTrue(list(map(response), "failed").isEmpty());
    }

    @Test
    void tessdataLanguages_returnsInstalledAvailableAndWritable(@TempDir Path tempDir)
            throws Exception {
        Files.createFile(tempDir.resolve("eng.traineddata"));
        Files.createFile(tempDir.resolve("deu.traineddata"));
        Files.createFile(tempDir.resolve("osd.traineddata")); // should be filtered

        UIDataTessdataController controller =
                new UIDataTessdataController(pathConfig(tempDir.toString()), MAPPER) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng", "fra");
                    }
                };

        Response response = controller.getTessdataLanguages();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        Map<String, Object> body = map(response);
        assertEquals("deu", list(body, "installed").get(0));
        assertEquals("eng", list(body, "installed").get(1));
        assertEquals("eng", list(body, "available").get(0));
        assertEquals("fra", list(body, "available").get(1));
        assertEquals(true, body.get("writable"));
    }

    @Test
    void tessdataLanguages_emptyDirectory(@TempDir Path tempDir) throws Exception {
        UIDataTessdataController controller =
                new UIDataTessdataController(pathConfig(tempDir.toString()), MAPPER) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };

        Response response = controller.getTessdataLanguages();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        Map<String, Object> body = map(response);
        assertTrue(list(body, "installed").isEmpty());
        assertEquals("eng", list(body, "available").get(0));
        assertEquals(true, body.get("writable"));
    }

    @Test
    void tessdataLanguages_nonTraineddataFilesAreIgnored(@TempDir Path tempDir) throws Exception {
        Files.createFile(tempDir.resolve("notes.txt"));

        UIDataTessdataController controller =
                new UIDataTessdataController(pathConfig(tempDir.toString()), MAPPER) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };

        Response response = controller.getTessdataLanguages();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        Map<String, Object> body = map(response);
        assertTrue(list(body, "installed").isEmpty());
        assertEquals(true, body.get("writable"));
    }

    @Test
    void tessdataLanguages_handlesNonExistentDirectory(@TempDir Path tempDir) throws Exception {
        Path missingDir = tempDir.resolve("missing");

        UIDataTessdataController controller =
                new UIDataTessdataController(pathConfig(missingDir.toString()), MAPPER) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };

        Response response = controller.getTessdataLanguages();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        Map<String, Object> body = map(response);
        assertTrue(list(body, "installed").isEmpty());
        assertEquals(true, body.get("writable"));
    }

    @Test
    void tessdataLanguages_marksNotWritable(@TempDir Path tempDir) throws Exception {
        UIDataTessdataController controller =
                new UIDataTessdataController(pathConfig(tempDir.toString()), MAPPER) {
                    @Override
                    protected boolean isWritableDirectory(Path dir) {
                        return false;
                    }

                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };

        Response response = controller.getTessdataLanguages();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertFalse((Boolean) map(response).get("writable"));
    }
}
