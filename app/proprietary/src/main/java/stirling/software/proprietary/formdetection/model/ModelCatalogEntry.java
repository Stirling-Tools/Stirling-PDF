package stirling.software.proprietary.formdetection.model;

import java.util.List;

import lombok.Data;

/**
 * One installable model plus the pre/post-processing spec its pipeline needs; verify every value
 * against the exported {@code .onnx}. A blank {@code onnxUrl} means not installable.
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

    // --- Pre-processing (must match the exported model) --------------------------
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
    /**
     * Head shape, so how the output is read. {@code yolo}: one anchor-grid tensor, input pixels,
     * activated scores. {@code rfdetr}: {@code dets} (normalised cxcywh) plus {@code labels}.
     */
    private String decoder = "yolo";

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
