package stirling.software.proprietary.formdetection.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.formdetection.inference.OnnxFormDetector;
import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;
import stirling.software.proprietary.formdetection.render.PageRasterizer;
import stirling.software.proprietary.formdetection.service.FormDetectionModelManager;

class FormDetectionControllerTest {

    private MockMvc mvc(
            FormDetectionModelManager manager,
            OnnxFormDetector detector,
            PageRasterizer rasterizer) {
        FormDetectionController controller =
                new FormDetectionController(
                        manager,
                        detector,
                        rasterizer,
                        Mockito.mock(CustomPDFDocumentFactory.class),
                        Mockito.mock(TempFileManager.class));
        return MockMvcBuilders.standaloneSetup(controller).build();
    }

    private MockMultipartFile pdf() {
        return new MockMultipartFile("file", "test.pdf", "application/pdf", "%PDF-1.4".getBytes());
    }

    /** A rasterizer that renders nothing, so the detector is never reached. */
    private PageRasterizer noPages() {
        return Mockito.mock(PageRasterizer.class);
    }

    private FormDetectionModelManager readyManager() {
        FormDetectionModelManager manager = Mockito.mock(FormDetectionModelManager.class);
        Mockito.when(manager.isReady()).thenReturn(true);
        Mockito.when(manager.getActiveEntry()).thenReturn(Optional.of(new ModelCatalogEntry()));
        return manager;
    }

    @Test
    void detectReturns503WhenModelNotReady() throws Exception {
        FormDetectionModelManager manager = Mockito.mock(FormDetectionModelManager.class);
        Mockito.when(manager.isReady()).thenReturn(false);

        mvc(manager, Mockito.mock(OnnxFormDetector.class), Mockito.mock(PageRasterizer.class))
                .perform(multipart("/api/v1/form/form-detection/detect").file(pdf()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.reason").value("DEPENDENCY"));
    }

    @Test
    void detectReturnsEmptyDetectionsForBlankRender() throws Exception {
        mvc(readyManager(), Mockito.mock(OnnxFormDetector.class), noPages())
                .perform(multipart("/api/v1/form/form-detection/detect").file(pdf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.detections").isArray())
                .andExpect(jsonPath("$.detections").isEmpty());
    }

    @Test
    void detectRejectsPdfsOverThePageLimit() throws Exception {
        PageRasterizer rasterizer = Mockito.mock(PageRasterizer.class);
        Mockito.doThrow(
                        new PageRasterizer.PageLimitExceededException(
                                FormDetectionController.MAX_PAGES + 1,
                                FormDetectionController.MAX_PAGES))
                .when(rasterizer)
                .rasterize(Mockito.any(), Mockito.anyInt(), Mockito.anyInt(), Mockito.any());

        mvc(readyManager(), Mockito.mock(OnnxFormDetector.class), rasterizer)
                .perform(multipart("/api/v1/form/form-detection/detect").file(pdf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("LIMIT"));
    }

    @Test
    void detectPassesThePageLimitToTheRasterizerSoItIsCheckedBeforeRendering() throws Exception {
        PageRasterizer rasterizer = noPages();

        mvc(readyManager(), Mockito.mock(OnnxFormDetector.class), rasterizer)
                .perform(multipart("/api/v1/form/form-detection/detect").file(pdf()))
                .andExpect(status().isOk());

        Mockito.verify(rasterizer)
                .rasterize(
                        Mockito.any(),
                        Mockito.anyInt(),
                        Mockito.eq(FormDetectionController.MAX_PAGES),
                        Mockito.any());
    }

    @Test
    void detectRejectsAnUnreadablePdfAsBadRequestNotAsAMissingDependency() throws Exception {
        PageRasterizer rasterizer = Mockito.mock(PageRasterizer.class);
        Mockito.doThrow(new PageRasterizer.UnreadablePdfException("corrupt", null))
                .when(rasterizer)
                .rasterize(Mockito.any(), Mockito.anyInt(), Mockito.anyInt(), Mockito.any());

        mvc(readyManager(), Mockito.mock(OnnxFormDetector.class), rasterizer)
                .perform(multipart("/api/v1/form/form-detection/detect").file(pdf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("INVALID_PDF"));
    }

    @Test
    void detectRejectsAnEmptyUploadBeforeTouchingTheEngine() throws Exception {
        PageRasterizer rasterizer = Mockito.mock(PageRasterizer.class);
        MockMultipartFile empty =
                new MockMultipartFile("file", "empty.pdf", "application/pdf", new byte[0]);

        mvc(readyManager(), Mockito.mock(OnnxFormDetector.class), rasterizer)
                .perform(multipart("/api/v1/form/form-detection/detect").file(empty))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("INVALID_PDF"));

        Mockito.verifyNoInteractions(rasterizer);
    }

    @Test
    void detectStillReports503WhenTheEngineItselfIsUnavailable() throws Exception {
        PageRasterizer rasterizer = Mockito.mock(PageRasterizer.class);
        Mockito.doThrow(new IllegalStateException("ONNX Runtime is unavailable"))
                .when(rasterizer)
                .rasterize(Mockito.any(), Mockito.anyInt(), Mockito.anyInt(), Mockito.any());

        mvc(readyManager(), Mockito.mock(OnnxFormDetector.class), rasterizer)
                .perform(multipart("/api/v1/form/form-detection/detect").file(pdf()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.reason").value("DEPENDENCY"));
    }

    @Test
    void detectToleratesOutOfRangeConfThreshold() throws Exception {
        mvc(readyManager(), Mockito.mock(OnnxFormDetector.class), noPages())
                .perform(
                        multipart("/api/v1/form/form-detection/detect")
                                .file(pdf())
                                .param("confThreshold", "-42"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.detections").isEmpty());
    }
}
