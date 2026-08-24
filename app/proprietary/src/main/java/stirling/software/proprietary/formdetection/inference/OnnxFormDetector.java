package stirling.software.proprietary.formdetection.inference;

import java.nio.FloatBuffer;
import java.nio.file.Path;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.locks.ReentrantReadWriteLock;

import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;
import stirling.software.proprietary.formdetection.service.FormDetectionModelManager;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OnnxValue;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;

/**
 * Holds the ONNX Runtime session for the active model. Lazily (re)loads when the active model
 * changes, guards session swaps with a read/write lock, and bounds concurrent inferences to limit
 * memory. The session input is NCHW float32 {@code [1,3,N,N]}; the raw output is returned as-is for
 * {@link Yolo#decode} to interpret per the model spec.
 */
@Slf4j
@Service
@ConditionalOnClass(name = "ai.onnxruntime.OrtEnvironment")
@RequiredArgsConstructor
public class OnnxFormDetector implements FormDetectionEngine {

    private final FormDetectionModelManager manager;

    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
    private final Semaphore concurrency =
            new Semaphore(Math.max(1, Runtime.getRuntime().availableProcessors() / 2));

    private volatile OrtSession session;
    private volatile String loadedModelId;
    private volatile String inputName;

    /**
     * Run the model and return every output tensor keyed by its graph name, in graph order.
     *
     * <p>Keyed by name rather than position because a query-based head emits two tensors of the
     * SAME shape - RF-DETR's {@code dets} and {@code labels} are both [1, 300, 4] when there are
     * three classes, since 4 box values and 3 classes + 1 no-object slot coincide. Picking by index
     * would silently decode logits as boxes.
     */
    public Map<String, Yolo.RawOutput> infer(float[] chw, int inputSize) {
        ensureLoaded();
        concurrency.acquireUninterruptibly();
        lock.readLock().lock();
        try {
            OrtEnvironment env = OrtEnvironment.getEnvironment();
            long[] shape = {1, 3, inputSize, inputSize};
            try (OnnxTensor tensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(chw), shape);
                    OrtSession.Result results =
                            session.run(Collections.singletonMap(inputName, tensor))) {
                Map<String, Yolo.RawOutput> outputs = new LinkedHashMap<>();
                for (Map.Entry<String, OnnxValue> entry : results) {
                    outputs.put(entry.getKey(), toRawOutput(entry.getKey(), entry.getValue()));
                }
                if (outputs.isEmpty()) {
                    throw new IllegalStateException("ONNX session returned no outputs");
                }
                return outputs;
            }
        } catch (OrtException e) {
            throw new IllegalStateException("ONNX inference failed: " + e.getMessage(), e);
        } finally {
            lock.readLock().unlock();
            concurrency.release();
        }
    }

    /** Flatten a [1, d1, d2] output into the row-major buffer the decoders index into. */
    private static Yolo.RawOutput toRawOutput(String name, OnnxValue value) throws OrtException {
        Object raw = value.getValue();
        if (!(raw instanceof float[][][] out3) || out3.length == 0) {
            throw new IllegalStateException(
                    "Unexpected ONNX output type for '"
                            + name
                            + "': "
                            + (raw == null ? "null" : raw.getClass()));
        }
        float[][] m = out3[0];
        int d1 = m.length;
        int d2 = d1 > 0 ? m[0].length : 0;
        float[] flat = new float[d1 * d2];
        for (int i = 0; i < d1; i++) {
            System.arraycopy(m[i], 0, flat, i * d2, d2);
        }
        return new Yolo.RawOutput(flat, d1, d2);
    }

    /** Force the next inference to reload from disk (called after install/uninstall). */
    @Override
    public void unload() {
        lock.writeLock().lock();
        try {
            closeSession();
            loadedModelId = null;
            inputName = null;
        } finally {
            lock.writeLock().unlock();
        }
    }

    private void ensureLoaded() {
        String activeId = manager.getActiveEntry().map(ModelCatalogEntry::getId).orElse(null);
        if (activeId == null) {
            throw new IllegalStateException("No Auto Form Detection model installed");
        }
        if (activeId.equals(loadedModelId) && session != null) {
            return;
        }
        lock.writeLock().lock();
        try {
            if (activeId.equals(loadedModelId) && session != null) {
                return;
            }
            Path file =
                    manager.getActiveModelFile()
                            .orElseThrow(
                                    () -> new IllegalStateException("Active model file missing"));
            try {
                OrtEnvironment env = OrtEnvironment.getEnvironment();
                OrtSession.SessionOptions opts = new OrtSession.SessionOptions();
                try {
                    opts.setIntraOpNumThreads(
                            Math.max(1, Runtime.getRuntime().availableProcessors() / 2));
                } catch (OrtException ignored) {
                    // best-effort tuning
                }
                closeSession();
                session = env.createSession(file.toString(), opts);
                inputName = session.getInputNames().iterator().next();
                loadedModelId = activeId;
                log.info("Loaded ONNX session for Auto Form Detection model '{}'", activeId);
            } catch (OrtException | RuntimeException | LinkageError e) {
                // Native library missing/incompatible for this OS+arch (e.g. a Linux-slimmed jar
                // run on Windows), or a model load failure. Degrade gracefully instead of letting
                // an UnsatisfiedLinkError escape - the detect endpoint reports unavailable and the
                // server keeps running.
                throw new IllegalStateException(
                        "ONNX Runtime is unavailable on this platform/build: " + e.getMessage(), e);
            }
        } finally {
            lock.writeLock().unlock();
        }
    }

    @PreDestroy
    void close() {
        unload();
    }

    private void closeSession() {
        if (session != null) {
            try {
                session.close();
            } catch (Exception ignored) {
                // ignore
            }
            session = null;
        }
    }
}
