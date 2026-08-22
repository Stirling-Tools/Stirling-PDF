package stirling.software.proprietary.formdetection.inference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;

/**
 * Parity tests for the RF-DETR decode path.
 *
 * <p>The fixture holds real tensors captured from the exported FFDetr ONNX, together with the
 * detections the reference Python decode produced from them. That makes this a genuine parity check
 * against the model rather than a restatement of the Java code: if the Java decode forgets the
 * sigmoid, reads the no-object column as a class, or treats the boxes as pixels rather than
 * normalised, the expected values below stop matching.
 */
class RfDetrTest {

    private static final String FIXTURE = "/formdetection/rfdetr-reference.json";

    private record Fixture(
            Map<String, Yolo.RawOutput> outputs,
            List<JsonNode> expected,
            int inputSize,
            float thr) {}

    private static Fixture load() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode root;
        try (InputStream in = RfDetrTest.class.getResourceAsStream(FIXTURE)) {
            assertNotNull(in, "missing fixture " + FIXTURE);
            root = mapper.readTree(in);
        }
        JsonNode queries = root.get("queries");
        int n = queries.size();
        int boxCols = queries.get(0).get("dets").size();
        int logitCols = queries.get(0).get("labels").size();
        float[] boxes = new float[n * boxCols];
        float[] logits = new float[n * logitCols];
        for (int i = 0; i < n; i++) {
            for (int c = 0; c < boxCols; c++) {
                boxes[i * boxCols + c] = (float) queries.get(i).get("dets").get(c).asDouble();
            }
            for (int c = 0; c < logitCols; c++) {
                logits[i * logitCols + c] = (float) queries.get(i).get("labels").get(c).asDouble();
            }
        }
        Map<String, Yolo.RawOutput> outputs = new LinkedHashMap<>();
        outputs.put("dets", new Yolo.RawOutput(boxes, n, boxCols));
        outputs.put("labels", new Yolo.RawOutput(logits, n, logitCols));

        List<JsonNode> expected = new ArrayList<>();
        // Re-index expectations onto the trimmed query list the fixture actually carries.
        for (JsonNode e : root.get("expected")) {
            expected.add(e);
        }
        return new Fixture(
                outputs,
                expected,
                root.get("inputSize").asInt(),
                (float) root.get("scoreThreshold").asDouble());
    }

    /**
     * Identity mapping: model input space == source bitmap, so decode output is directly
     * comparable.
     */
    private static Yolo.Preprocessed identityPre(int inputSize) {
        return new Yolo.Preprocessed(new float[0], inputSize, 1f, 1f, 0, 0, inputSize, inputSize);
    }

    private static ModelCatalogEntry spec() {
        ModelCatalogEntry spec = new ModelCatalogEntry();
        spec.setDecoder("rfdetr");
        spec.setInputSize(1024);
        spec.setClassNames(List.of("text", "choice", "signature"));
        spec.setNms("none");
        return spec;
    }

    @Test
    void decodesTheExportedModelsRealOutputToTheReferenceDetections() throws Exception {
        Fixture f = load();

        List<Yolo.Detection> got =
                RfDetr.decode(f.outputs(), spec(), identityPre(f.inputSize()), f.thr());

        assertEquals(
                f.expected().size(),
                got.size(),
                "detection count must match the Python reference decode");
        // Compare as sets keyed on rounded geometry: NMS is off, so order is query order in both.
        for (int i = 0; i < got.size(); i++) {
            JsonNode want = f.expected().get(i);
            Yolo.Detection d = got.get(i);
            assertEquals(want.get("cls").asInt(), d.classId(), "class at index " + i);
            assertEquals(want.get("score").asDouble(), d.score(), 1e-4, "score at index " + i);
            assertEquals(want.get("x").asDouble(), d.x(), 0.05, "x at index " + i);
            assertEquals(want.get("y").asDouble(), d.y(), 0.05, "y at index " + i);
            assertEquals(want.get("w").asDouble(), d.w(), 0.05, "w at index " + i);
            assertEquals(want.get("h").asDouble(), d.h(), 0.05, "h at index " + i);
        }
    }

    @Test
    void findsTheFormsEightTextTwoChoiceAndOneSignature() throws Exception {
        Fixture f = load();
        List<Yolo.Detection> got =
                RfDetr.decode(f.outputs(), spec(), identityPre(f.inputSize()), f.thr());
        long text = got.stream().filter(d -> d.classId() == 0).count();
        long choice = got.stream().filter(d -> d.classId() == 1).count();
        long signature = got.stream().filter(d -> d.classId() == 2).count();
        assertEquals(8, text, "text fields");
        assertEquals(2, choice, "checkboxes");
        assertEquals(1, signature, "signature line");
    }

    @Test
    void bindsOutputsByNameNotPosition() throws Exception {
        Fixture f = load();
        // Both tensors are [n, 4] here, so a positional reader cannot tell them apart. Swapping
        // insertion order must change nothing.
        Map<String, Yolo.RawOutput> swapped = new LinkedHashMap<>();
        swapped.put("labels", f.outputs().get("labels"));
        swapped.put("dets", f.outputs().get("dets"));

        List<Yolo.Detection> normal =
                RfDetr.decode(f.outputs(), spec(), identityPre(f.inputSize()), f.thr());
        List<Yolo.Detection> reordered =
                RfDetr.decode(swapped, spec(), identityPre(f.inputSize()), f.thr());

        assertEquals(normal.toString(), reordered.toString());
    }

    @Test
    void fixtureCarriesTheAmbiguousFourColumnShape() throws Exception {
        Fixture f = load();
        assertEquals(
                4,
                f.outputs().get("labels").d2(),
                "3 classes + 1 no-object slot - the case where labels and dets share a shape");
        assertEquals(4, f.outputs().get("dets").d2());
        for (Yolo.Detection d :
                RfDetr.decode(f.outputs(), spec(), identityPre(f.inputSize()), f.thr())) {
            assertTrue(d.classId() >= 0 && d.classId() < 3, "classId out of range: " + d.classId());
        }
    }

    /**
     * Hand-built because the exported model never lets the no-object column win - its highest
     * sigmoid across all 300 queries is 0.0014 - so real tensors cannot exercise this guard.
     * Without it a dominant 4th column would yield classId 3 and index past classNames.
     */
    @Test
    void neverClassifiesAQueryAsTheNoObjectColumn() {
        // One query: no-object logit is overwhelmingly the largest, real classes are weak.
        float[] logits = {-4.0f, -3.0f, -5.0f, 9.0f};
        float[] boxes = {0.5f, 0.5f, 0.2f, 0.1f};
        Map<String, Yolo.RawOutput> outputs = new LinkedHashMap<>();
        outputs.put("dets", new Yolo.RawOutput(boxes, 1, 4));
        outputs.put("labels", new Yolo.RawOutput(logits, 1, 4));

        List<Yolo.Detection> got = RfDetr.decode(outputs, spec(), identityPre(1024), 0.30f);

        assertTrue(
                got.isEmpty(),
                "a query dominated by the no-object slot must be dropped, got: " + got);
    }

    @Test
    void returnsNothingWhenAnExpectedOutputIsAbsent() throws Exception {
        Fixture f = load();
        Map<String, Yolo.RawOutput> onlyBoxes = Map.of("dets", f.outputs().get("dets"));
        assertTrue(RfDetr.decode(onlyBoxes, spec(), identityPre(f.inputSize()), f.thr()).isEmpty());
    }
}
