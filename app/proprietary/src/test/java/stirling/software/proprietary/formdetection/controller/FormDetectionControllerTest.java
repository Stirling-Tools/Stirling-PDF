package stirling.software.proprietary.formdetection.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
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

    @Test
    void detectReturns503WhenModelNotReady() throws Exception {
        FormDetectionModelManager manager = Mockito.mock(FormDetectionModelManager.class);
        Mockito.when(manager.isReady()).thenReturn(false);

        mvc(manager, Mockito.mock(OnnxFormDetector.class), Mockito.mock(PageRasterizer.class))
                .perform(multipart("/api/v1/ai/form-detection/detect").file(pdf()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.reason").value("DEPENDENCY"));
    }

    @Test
    void detectReturnsEmptyDetectionsForBlankRender() throws Exception {
        FormDetectionModelManager manager = Mockito.mock(FormDetectionModelManager.class);
        Mockito.when(manager.isReady()).thenReturn(true);
        Mockito.when(manager.getActiveEntry()).thenReturn(Optional.of(new ModelCatalogEntry()));

        PageRasterizer rasterizer = Mockito.mock(PageRasterizer.class);
        Mockito.when(rasterizer.rasterize(Mockito.any(), Mockito.anyInt()))
                .thenReturn(List.of()); // no pages -> no detections, detector never called

        mvc(manager, Mockito.mock(OnnxFormDetector.class), rasterizer)
                .perform(multipart("/api/v1/ai/form-detection/detect").file(pdf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.detections").isArray())
                .andExpect(jsonPath("$.detections").isEmpty());
    }
}
