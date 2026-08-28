package stirling.software.proprietary.formdetection.inference;

/**
 * Lets the model manager drop an engine's loaded model. Must stay ONNX-free: Spring introspecting
 * {@code OnnxFormDetector} without onnxruntime would kill startup.
 */
public interface FormDetectionEngine {

    /** Discard any loaded model so the next inference reloads from disk. */
    void unload();
}
