package stirling.software.proprietary.formdetection.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import stirling.software.proprietary.formdetection.inference.OnnxFormDetector;
import stirling.software.proprietary.formdetection.inference.Yolo;
import stirling.software.proprietary.formdetection.model.DetectedField;
import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;
import stirling.software.proprietary.formdetection.render.PageRasterizer;

class FormDetectionServiceTest {

    private static final int SIZE = 10;

    private ModelCatalogEntry spec() {
        ModelCatalogEntry e = new ModelCatalogEntry();
        e.setInputSize(SIZE);
        e.setResizeMode("stretch");
        e.setChannelOrder("rgb");
        e.setOutputLayout("nc_first");
        e.setHasObjectness(false);
        e.setClassNames(List.of("text"));
        e.setClassFieldTypes(List.of("text"));
        e.setNms("perClass");
        e.setIou(0.5f);
        e.setScoreThreshold(0.25f);
        return e;
    }

    private FormDetectionModelManager readyManager(ModelCatalogEntry spec) {
        FormDetectionModelManager manager = Mockito.mock(FormDetectionModelManager.class);
        Mockito.when(manager.isReady()).thenReturn(true);
        Mockito.when(manager.getActiveEntry()).thenReturn(Optional.of(spec));
        return manager;
    }

    /** A rasterizer that hands the pipeline one blank 10x10 page. */
    @SuppressWarnings("unchecked")
    private PageRasterizer onePage() throws Exception {
        PageRasterizer rasterizer = Mockito.mock(PageRasterizer.class);
        PageRasterizer.RasterPage page =
                new PageRasterizer.RasterPage(
                        0,
                        new byte[SIZE * SIZE * 4],
                        SIZE,
                        SIZE,
                        SIZE,
                        SIZE,
                        1f,
                        1f,
                        0,
                        SIZE,
                        SIZE,
                        0f,
                        0f);
        Mockito.doAnswer(
                        inv -> {
                            ((Consumer<PageRasterizer.RasterPage>) inv.getArgument(3)).accept(page);
                            return null;
                        })
                .when(rasterizer)
                .rasterize(Mockito.any(), Mockito.anyInt(), Mockito.anyInt(), Mockito.any());
        return rasterizer;
    }

    /** Two overlapping boxes on one class, at the caller-chosen score. */
    private OnnxFormDetector detectorScoring(float first, float second) {
        float[] data = {5, 5, 5, 5, 4, 4, 4, 4, first, second};
        OnnxFormDetector detector = Mockito.mock(OnnxFormDetector.class);
        Mockito.when(detector.infer(Mockito.any(), Mockito.anyInt()))
                .thenReturn(Map.of("out", new Yolo.RawOutput(data, 5, 2)));
        return detector;
    }

    @Test
    void aZeroThresholdIsFlooredSoSubThresholdAnchorsAreNotAllKept() throws Exception {
        ModelCatalogEntry spec = spec();
        FormDetectionService service =
                new FormDetectionService(
                        readyManager(spec), detectorScoring(0.005f, 0.004f), onePage());

        assertTrue(
                service.detect(new byte[] {1}, 0f).isEmpty(),
                "a threshold of 0 must not let every anchor through");
    }

    @Test
    void aThresholdAboveTheFloorStillSelectsNormally() throws Exception {
        ModelCatalogEntry spec = spec();
        FormDetectionService service =
                new FormDetectionService(
                        readyManager(spec), detectorScoring(0.9f, 0.8f), onePage());

        List<DetectedField> fields = service.detect(new byte[] {1}, 0.5f);

        assertEquals(1, fields.size(), "the overlapping pair collapses to one field");
        assertEquals(0.9f, fields.getFirst().confidence(), 1e-5);
    }
}
