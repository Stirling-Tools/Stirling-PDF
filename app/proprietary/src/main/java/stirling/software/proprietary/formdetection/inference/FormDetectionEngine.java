package stirling.software.proprietary.formdetection.inference;

/**
 * Lets the model manager drop an engine's loaded model without knowing what the engine is.
 *
 * <p>Deliberately free of any ONNX type: the manager is an unconditional bean, and referencing
 * {@code OnnxFormDetector} directly would make Spring introspect it on builds that ship no
 * onnxruntime, failing startup for the whole app.
 */
public interface FormDetectionEngine {

    /** Discard any loaded model so the next inference reloads from disk. */
    void unload();
}
