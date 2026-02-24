package stirling.software.proprietary.security.controller.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.common.configuration.RuntimePathConfig;

import tools.jackson.databind.json.JsonMapper;

class UIDataTessdataControllerTest {

    @Test
    void downloadTessdataLanguages_withEmptyList_returnsBadRequest() throws Exception {
        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn("ignored/path");

        UIDataTessdataController controller =
                new UIDataTessdataController(runtimePathConfig, JsonMapper.builder().build()) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(
                        post("/api/v1/ui-data/tessdata/download")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"languages\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("No languages provided for download"));
    }

    @Test
    void downloadTessdataLanguages_blocksPathTraversal(@TempDir Path tempDir) throws Exception {
        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn(tempDir.toString());

        UIDataTessdataController controller =
                new UIDataTessdataController(runtimePathConfig, JsonMapper.builder().build()) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(
                        post("/api/v1/ui-data/tessdata/download")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"languages\":[\"../evil\"]}"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.downloaded").isArray())
                .andExpect(jsonPath("$.downloaded").isEmpty())
                .andExpect(jsonPath("$.failed[0]").value("../evil"));

        // Ensure no file was written outside the tessdata directory
        Path escapedPath = tempDir.resolve("../evil.traineddata").normalize();
        assert Files.notExists(escapedPath) : "Traversal path should not be written";
    }

    @Test
    void downloadTessdataLanguages_rejectsUnknownLanguage(@TempDir Path tempDir) throws Exception {
        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn(tempDir.toString());

        UIDataTessdataController controller =
                new UIDataTessdataController(runtimePathConfig, JsonMapper.builder().build()) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(
                        post("/api/v1/ui-data/tessdata/download")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"languages\":[\"fra\"]}"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.downloaded").isEmpty())
                .andExpect(jsonPath("$.failed[0]").value("fra"));
    }

    @Test
    void downloadTessdataLanguages_successAndFailureMixed(@TempDir Path tempDir) throws Exception {
        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn(tempDir.toString());

        UIDataTessdataController controller =
                new UIDataTessdataController(runtimePathConfig, JsonMapper.builder().build()) {
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

        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(
                        post("/api/v1/ui-data/tessdata/download")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"languages\":[\"eng\",\"fra\"]}"))
                .andExpect(status().isMultiStatus())
                .andExpect(jsonPath("$.downloaded[0]").value("eng"))
                .andExpect(jsonPath("$.failed[0]").value("fra"));
    }

    @Test
    void downloadTessdataLanguages_handlesInvalidSanitizedLanguage(@TempDir Path tempDir)
            throws Exception {
        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn(tempDir.toString());

        UIDataTessdataController controller =
                new UIDataTessdataController(runtimePathConfig, JsonMapper.builder().build()) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };

        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(
                        post("/api/v1/ui-data/tessdata/download")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"languages\":[\"eng/\"]}"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.downloaded").isEmpty())
                .andExpect(jsonPath("$.failed[0]").value("eng/"));
    }

    @Test
    void downloadTessdataLanguages_returnsForbiddenWhenNotWritable(@TempDir Path tempDir)
            throws Exception {
        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn(tempDir.toString());

        UIDataTessdataController controller =
                new UIDataTessdataController(runtimePathConfig, JsonMapper.builder().build()) {
                    @Override
                    protected boolean isWritableDirectory(Path dir) {
                        return false;
                    }
                };

        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(
                        post("/api/v1/ui-data/tessdata/download")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"languages\":[\"eng\"]}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void downloadTessdataLanguages_handlesNetworkFailure(@TempDir Path tempDir) throws Exception {
        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn(tempDir.toString());

        UIDataTessdataController controller =
                new UIDataTessdataController(runtimePathConfig, JsonMapper.builder().build()) {
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

        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(
                        post("/api/v1/ui-data/tessdata/download")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"languages\":[\"eng\"]}"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.downloaded").isArray())
                .andExpect(jsonPath("$.downloaded").isEmpty())
                .andExpect(jsonPath("$.failed[0]").value("eng"));
    }

    @Test
    void downloadTessdataLanguages_allSuccess(@TempDir Path tempDir) throws Exception {
        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn(tempDir.toString());

        UIDataTessdataController controller =
                new UIDataTessdataController(runtimePathConfig, JsonMapper.builder().build()) {
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

        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(
                        post("/api/v1/ui-data/tessdata/download")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"languages\":[\"eng\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.downloaded[0]").value("eng"))
                .andExpect(jsonPath("$.failed").isArray())
                .andExpect(jsonPath("$.failed").isEmpty());
    }

    @Test
    void tessdataLanguages_returnsInstalledAvailableAndWritable(@TempDir Path tempDir)
            throws Exception {
        Files.createFile(tempDir.resolve("eng.traineddata"));
        Files.createFile(tempDir.resolve("deu.traineddata"));
        Files.createFile(tempDir.resolve("osd.traineddata")); // should be filtered

        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn(tempDir.toString());

        UIDataTessdataController controller =
                new UIDataTessdataController(runtimePathConfig, JsonMapper.builder().build()) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng", "fra");
                    }
                };

        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(get("/api/v1/ui-data/tessdata-languages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.installed[0]").value("deu"))
                .andExpect(jsonPath("$.installed[1]").value("eng"))
                .andExpect(jsonPath("$.available[0]").value("eng"))
                .andExpect(jsonPath("$.available[1]").value("fra"))
                .andExpect(jsonPath("$.writable").value(true));
    }

    @Test
    void tessdataLanguages_emptyDirectory(@TempDir Path tempDir) throws Exception {
        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn(tempDir.toString());

        UIDataTessdataController controller =
                new UIDataTessdataController(runtimePathConfig, JsonMapper.builder().build()) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };

        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(get("/api/v1/ui-data/tessdata-languages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.installed").isArray())
                .andExpect(jsonPath("$.installed").isEmpty())
                .andExpect(jsonPath("$.available[0]").value("eng"))
                .andExpect(jsonPath("$.writable").value(true));
    }

    @Test
    void tessdataLanguages_nonTraineddataFilesAreIgnored(@TempDir Path tempDir) throws Exception {
        Files.createFile(tempDir.resolve("notes.txt"));

        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn(tempDir.toString());

        UIDataTessdataController controller =
                new UIDataTessdataController(runtimePathConfig, JsonMapper.builder().build()) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };

        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(get("/api/v1/ui-data/tessdata-languages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.installed").isArray())
                .andExpect(jsonPath("$.installed").isEmpty())
                .andExpect(jsonPath("$.writable").value(true));
    }

    @Test
    void tessdataLanguages_handlesNonExistentDirectory(@TempDir Path tempDir) throws Exception {
        Path missingDir = tempDir.resolve("missing");
        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn(missingDir.toString());

        UIDataTessdataController controller =
                new UIDataTessdataController(runtimePathConfig, JsonMapper.builder().build()) {
                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };

        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(get("/api/v1/ui-data/tessdata-languages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.installed").isArray())
                .andExpect(jsonPath("$.installed").isEmpty())
                .andExpect(jsonPath("$.writable").value(true));
    }

    @Test
    void tessdataLanguages_marksNotWritable(@TempDir Path tempDir) throws Exception {
        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn(tempDir.toString());

        UIDataTessdataController controller =
                new UIDataTessdataController(runtimePathConfig, JsonMapper.builder().build()) {
                    @Override
                    protected boolean isWritableDirectory(Path dir) {
                        return false;
                    }

                    @Override
                    protected List<String> getRemoteTessdataLanguages() {
                        return List.of("eng");
                    }
                };

        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(get("/api/v1/ui-data/tessdata-languages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.writable").value(false));
    }
}
