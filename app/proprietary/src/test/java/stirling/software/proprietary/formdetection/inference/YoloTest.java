package stirling.software.proprietary.formdetection.inference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

class YoloTest {

    private ModelCatalogEntry spec() {
        ModelCatalogEntry e = new ModelCatalogEntry();
        e.setInputSize(10);
        e.setResizeMode("letterbox");
        e.setChannelOrder("rgb");
        e.setOutputLayout("nc_first");
        e.setHasObjectness(false);
        e.setClassNames(List.of("text", "choice"));
        e.setClassFieldTypes(List.of("text", "checkbox"));
        e.setNms("perClass");
        e.setIou(0.5f);
        return e;
    }

    @Test
    void decodeThresholdsAndSuppressesOverlaps() {
        ModelCatalogEntry spec = spec();
        // identity transform (scale 1, no pad), 10x10 source
        Yolo.Preprocessed pre = new Yolo.Preprocessed(new float[0], 10, 1f, 1f, 0, 0, 10, 10);

        // nc_first layout [channels=6][anchors=3], data[c*anchors + a]
        // box A (cx5,cy5,w4,h4) twice (overlapping) + box B (cx8,cy8,w2,h2)
        float[] data = {
            5,
            5,
            8, // cx
            5,
            5,
            8, // cy
            4,
            4,
            2, // w
            4,
            4,
            2, // h
            0.9f,
            0.8f,
            0.7f, // text score
            0.1f,
            0.1f,
            0.1f // choice score
        };
        Yolo.RawOutput out = new Yolo.RawOutput(data, 6, 3);

        List<Yolo.Detection> dets = Yolo.decode(out, spec, pre, 0.5f);

        // a0 (box A, 0.9) kept; a1 (box A', 0.8) suppressed by NMS; a2 (box B, 0.7) kept
        assertEquals(2, dets.size());

        Yolo.Detection a = dets.get(0);
        assertEquals(0, a.classId());
        assertEquals(0.9f, a.score(), 1e-5);
        assertEquals(3f, a.x(), 1e-4);
        assertEquals(3f, a.y(), 1e-4);
        assertEquals(4f, a.w(), 1e-4);
        assertEquals(4f, a.h(), 1e-4);

        Yolo.Detection b = dets.get(1);
        assertEquals(0.7f, b.score(), 1e-5);
        assertEquals(7f, b.x(), 1e-4);
        assertEquals(7f, b.y(), 1e-4);
        assertEquals(2f, b.w(), 1e-4);
        assertEquals(2f, b.h(), 1e-4);
    }

    @Test
    void decodeIsDeterministic() {
        ModelCatalogEntry spec = spec();
        Yolo.Preprocessed pre = new Yolo.Preprocessed(new float[0], 10, 1f, 1f, 0, 0, 10, 10);
        float[] data = {5, 5, 8, 5, 5, 8, 4, 4, 2, 4, 4, 2, 0.9f, 0.8f, 0.7f, 0.1f, 0.1f, 0.1f};
        Yolo.RawOutput out = new Yolo.RawOutput(data, 6, 3);
        assertEquals(
                Yolo.decode(out, spec, pre, 0.5f).toString(),
                Yolo.decode(out, spec, pre, 0.5f).toString());
    }

    @Test
    void thresholdDropsLowScores() {
        ModelCatalogEntry spec = spec();
        Yolo.Preprocessed pre = new Yolo.Preprocessed(new float[0], 10, 1f, 1f, 0, 0, 10, 10);
        float[] data = {5, 5, 8, 5, 5, 8, 4, 4, 2, 4, 4, 2, 0.9f, 0.8f, 0.7f, 0.1f, 0.1f, 0.1f};
        Yolo.RawOutput out = new Yolo.RawOutput(data, 6, 3);
        // threshold above every score -> nothing survives
        assertEquals(0, Yolo.decode(out, spec, pre, 0.95f).size());
    }

    @Test
    void nmsBoundsHowManyBoxesItWillCompare() {
        // Non-overlapping, so suppression itself removes nothing and only the cap can.
        int count = Yolo.MAX_NMS_CANDIDATES + 500;
        List<Yolo.Detection> dets = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            dets.add(new Yolo.Detection(0, (i + 1) / (float) count, i * 4f, 0f, 2f, 2f));
        }

        List<Yolo.Detection> kept = Yolo.nms(dets, "perClass", 0.5f);

        assertEquals(Yolo.MAX_NMS_CANDIDATES, kept.size());
        float worstKept = 1f;
        for (Yolo.Detection d : kept) {
            worstKept = Math.min(worstKept, d.score());
        }
        assertTrue(worstKept > 500 / (float) count, "the cap must drop the lowest-scoring boxes");
    }

    @Test
    void nmsCapDoesNotLogPerPage() {
        Logger yoloLogger = (Logger) LoggerFactory.getLogger(Yolo.class);
        Level original = yoloLogger.getLevel();
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        yoloLogger.setLevel(Level.TRACE);
        yoloLogger.addAppender(appender);
        try {
            List<Yolo.Detection> dets = new ArrayList<>();
            for (int i = 0; i < Yolo.MAX_NMS_CANDIDATES + 1; i++) {
                dets.add(new Yolo.Detection(0, 0.5f, i * 4f, 0f, 2f, 2f));
            }

            for (int page = 0; page < 20; page++) {
                Yolo.nms(dets, "perClass", 0.5f);
            }

            assertThat(appender.list)
                    .as("a per-page cap must not shout once per page")
                    .noneMatch(e -> e.getLevel().isGreaterOrEqual(Level.INFO));
        } finally {
            yoloLogger.detachAppender(appender);
            yoloLogger.setLevel(original);
        }
    }
}
