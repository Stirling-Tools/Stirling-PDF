package stirling.software.SPDF.controller.api;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.SPDF.service.EditorFontRegistry;
import stirling.software.SPDF.service.EditorFontRegistry.EditorFontFace;
import stirling.software.SPDF.service.EditorFontRegistry.EditorFontFamily;
import stirling.software.SPDF.service.EditorFontRegistry.EditorFontManifest;
import stirling.software.SPDF.service.EditorFontRegistry.FontFile;
import stirling.software.SPDF.service.EditorFontRegistry.Snapshot;

class EditorFontControllerTest {

    private static final String ID = "a".repeat(64);
    private static final String ETAG = "0123456789abcdef0123456789abcdef";

    @TempDir Path tempDir;

    private EditorFontRegistry registry;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        registry = mock(EditorFontRegistry.class);
        EditorFontFace face =
                new EditorFontFace(ID, "Regular", false, false, 400, "AcmeSans", "ttf", 4);
        when(registry.snapshot())
                .thenReturn(
                        new Snapshot(
                                new EditorFontManifest(
                                        List.of(new EditorFontFamily("Acme Sans", List.of(face)))),
                                ETAG));
        mvc = MockMvcBuilders.standaloneSetup(new EditorFontController(registry)).build();
    }

    @Test
    void manifestIsRevalidatedByEtag() throws Exception {
        mvc.perform(get("/api/v1/ui-data/editor-fonts"))
                .andExpect(status().isOk())
                .andExpect(header().string("ETag", "\"" + ETAG + "\""))
                .andExpect(header().string("Cache-Control", Matchers.containsString("no-cache")))
                .andExpect(jsonPath("$.families[0].family").value("Acme Sans"))
                .andExpect(jsonPath("$.families[0].faces[0].id").value(ID))
                .andExpect(jsonPath("$.families[0].faces[0].path").doesNotExist());

        mvc.perform(get("/api/v1/ui-data/editor-fonts").header("If-None-Match", "\"" + ETAG + "\""))
                .andExpect(status().isNotModified());
    }

    @Test
    void fontBytesAreImmutableAndContentAddressed() throws Exception {
        Path font = tempDir.resolve("Acme.ttf");
        Files.write(font, new byte[] {0, 1, 0, 0});
        when(registry.resolve(ID)).thenReturn(Optional.of(new FontFile(font, "ttf", 4)));

        mvc.perform(get("/api/v1/ui-data/editor-fonts/" + ID))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "font/ttf"))
                .andExpect(header().string("Cache-Control", Matchers.containsString("immutable")))
                .andExpect(header().string("Cache-Control", Matchers.containsString("private")))
                .andExpect(header().string("ETag", "\"" + ID + "\""))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().bytes(new byte[] {0, 1, 0, 0}));

        mvc.perform(
                        get("/api/v1/ui-data/editor-fonts/" + ID)
                                .header("If-None-Match", "\"" + ID + "\""))
                .andExpect(status().isNotModified());
    }

    @Test
    void unknownFontIsNotFound() throws Exception {
        when(registry.resolve("missing")).thenReturn(Optional.empty());

        mvc.perform(get("/api/v1/ui-data/editor-fonts/missing")).andExpect(status().isNotFound());
    }
}
