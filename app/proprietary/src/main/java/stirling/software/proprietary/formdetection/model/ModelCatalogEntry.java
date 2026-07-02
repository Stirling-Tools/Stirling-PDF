package stirling.software.proprietary.formdetection.model;

import java.util.List;

import lombok.Data;

/**
 * One installable form-detection model plus the data-driven pre/post-processing spec the inference
 * pipeline needs. The exact same numeric values are surfaced to the browser (via the model status
 * endpoint) so the in-browser and server inference paths stay equivalent.
 *
 * <p>NOTE: the pipeline-spec defaults below follow common Ultralytics-YOLO conventions. The precise
 * values for a given model (input size, resize mode, channel order, output layout, NMS, class
 * indices) MUST be verified against the actual exported {@code .onnx} before that entry's {@code
 * onnxUrl}/{@code sha256} are populated. An entry with a blank {@code onnxUrl} or {@code sha256} is
 * not installable, which keeps the distribution shippable without any bundled model.
 */
@Data
public class ModelCatalogEntry {

    // --- Identity / distribution -------------------------------------------------
    private String id;
    private String displayName;
    private String description;
    private String license;
    private long sizeBytes;

    /** Direct download URL of the .onnx. Blank = not yet available (install is rejected). */
    private String onnxUrl;

    /** Lower-hex SHA-256 of the .onnx. Blank = not yet available (install is rejected). */
    private String sha256;

    // --- Pre-processing (parity-critical, mirrored by the browser) ---------------
    /** Square model input edge in pixels. */
    private int inputSize = 1024;

    /** "letterbox" (aspect-preserving pad) or "stretch" (resize to square). */
    private String resizeMode = "letterbox";

    /** RGB letterbox pad colour. */
    private int[] padColor = {114, 114, 114};

    /** "rgb" or "bgr" channel order fed to the model. */
    private String channelOrder = "rgb";

    /**
     * Per-channel mean subtracted after dividing the raw byte by 255 ({@code (raw/255 -
     * mean)/std}).
     */
    private float[] normMean = {0f, 0f, 0f};

    /** Per-channel std applied after mean subtraction. */
    private float[] normStd = {1f, 1f, 1f};

    // --- Post-processing (parity-critical) ---------------------------------------
    /** "nc_first" => output [1, 4+nc, anchors]; "anchors_first" => [1, anchors, 4+nc]. */
    private String outputLayout = "nc_first";

    /** True if an objectness score column precedes the class scores (YOLOv5 style). */
    private boolean hasObjectness = false;

    /** Class index -> label. */
    private List<String> classNames = List.of("text", "choice", "signature");

    /** Class index -> AcroForm field type (text|checkbox|radio|signature). */
    private List<String> classFieldTypes = List.of("text", "checkbox", "signature");

    private float scoreThreshold = 0.25f;

    /** "none", "classAgnostic" or "perClass". */
    private String nms = "perClass";

    private float iou = 0.45f;
}
