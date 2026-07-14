package stirling.software.proprietary.formdetection.inference;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.List;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;

/**
 * Pure pre/post-processing for a YOLO-style detector, driven entirely by the {@link
 * ModelCatalogEntry} spec. The browser pipeline mirrors this exactly so both inference paths agree.
 *
 * <p>Coordinate spaces: {@code preprocess} maps the source bitmap into the model's NxN input;
 * {@code decode} reads raw model output (boxes in input-pixel space), thresholds, runs NMS, and
 * un-projects boxes back to the original bitmap-pixel space (top-left origin). Mapping to PDF
 * points is done separately by {@code CoordinateMapper}.
 */
@Slf4j
public final class Yolo {

    private Yolo() {}

    /** Normalised model input plus the transform needed to invert it. */
    public record Preprocessed(
            float[] chw,
            int inputSize,
            float scaleX,
            float scaleY,
            int padX,
            int padY,
            int srcW,
            int srcH) {}

    /** Raw model output flattened to {@code data[i*d2 + j]} with dims {@code d1 x d2}. */
    public record RawOutput(float[] data, int d1, int d2) {}

    /** A detection in original bitmap-pixel space, top-left origin. */
    public record Detection(int classId, float score, float x, float y, float w, float h) {}

    /** Letterbox/stretch-resize, normalise and lay out as NCHW float32. */
    public static Preprocessed preprocess(byte[] rgba, int srcW, int srcH, ModelCatalogEntry spec) {
        int n = spec.getInputSize();
        boolean letterbox = !"stretch".equalsIgnoreCase(spec.getResizeMode());

        float scaleX;
        float scaleY;
        int padX;
        int padY;
        int drawW;
        int drawH;
        if (letterbox) {
            float scale = Math.min((float) n / srcW, (float) n / srcH);
            drawW = Math.max(1, Math.round(srcW * scale));
            drawH = Math.max(1, Math.round(srcH * scale));
            padX = (n - drawW) / 2;
            padY = (n - drawH) / 2;
            scaleX = scale;
            scaleY = scale;
        } else {
            drawW = n;
            drawH = n;
            padX = 0;
            padY = 0;
            scaleX = (float) n / srcW;
            scaleY = (float) n / srcH;
        }

        int[] pad = spec.getPadColor();
        Color fill =
                new Color(
                        clampByte(pad != null && pad.length > 0 ? pad[0] : 114),
                        clampByte(pad != null && pad.length > 1 ? pad[1] : 114),
                        clampByte(pad != null && pad.length > 2 ? pad[2] : 114));

        BufferedImage canvas = new BufferedImage(n, n, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = canvas.createGraphics();
        try {
            g.setRenderingHint(
                    RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setColor(fill);
            g.fillRect(0, 0, n, n);
            g.drawImage(rgbaToImage(rgba, srcW, srcH), padX, padY, drawW, drawH, null);
        } finally {
            g.dispose();
        }

        boolean bgr = "bgr".equalsIgnoreCase(spec.getChannelOrder());
        float[] mean = orZeros(spec.getNormMean());
        float[] std = orOnes(spec.getNormStd());
        int plane = n * n;
        float[] chw = new float[3 * plane];
        int[] px = canvas.getRGB(0, 0, n, n, null, 0, n);
        for (int i = 0; i < plane; i++) {
            int rgb = px[i];
            float r = ((rgb >> 16) & 0xFF) / 255f;
            float gg = ((rgb >> 8) & 0xFF) / 255f;
            float b = (rgb & 0xFF) / 255f;
            float c0 = bgr ? b : r;
            float c1 = gg;
            float c2 = bgr ? r : b;
            chw[i] = (c0 - mean[0]) / std[0];
            chw[plane + i] = (c1 - mean[1]) / std[1];
            chw[2 * plane + i] = (c2 - mean[2]) / std[2];
        }
        return new Preprocessed(chw, n, scaleX, scaleY, padX, padY, srcW, srcH);
    }

    /** Decode raw output, threshold, NMS, and un-project to original bitmap pixels. */
    public static List<Detection> decode(
            RawOutput out, ModelCatalogEntry spec, Preprocessed pre, float scoreThreshold) {
        int numClasses = spec.getClassNames() == null ? 0 : spec.getClassNames().size();
        if (numClasses == 0) {
            return List.of();
        }
        boolean obj = spec.isHasObjectness();
        boolean ncFirst = !"anchors_first".equalsIgnoreCase(spec.getOutputLayout());
        int channels = ncFirst ? out.d1() : out.d2();
        int anchors = ncFirst ? out.d2() : out.d1();
        int expected = 4 + (obj ? 1 : 0) + numClasses;
        if (channels < expected) {
            log.warn(
                    "ONNX output channel count {} < expected {} (4 + obj + {} classes); skipping",
                    channels,
                    expected,
                    numClasses);
            return List.of();
        }
        int classOffset = 4 + (obj ? 1 : 0);
        float[] data = out.data();

        List<Detection> dets = new ArrayList<>();
        for (int a = 0; a < anchors; a++) {
            float objScore = obj ? at(data, ncFirst, anchors, channels, 4, a) : 1f;
            int bestClass = -1;
            float bestScore = 0f;
            for (int c = 0; c < numClasses; c++) {
                float s = at(data, ncFirst, anchors, channels, classOffset + c, a) * objScore;
                if (s > bestScore) {
                    bestScore = s;
                    bestClass = c;
                }
            }
            if (bestClass < 0 || bestScore < scoreThreshold) {
                continue;
            }
            float cx = at(data, ncFirst, anchors, channels, 0, a);
            float cy = at(data, ncFirst, anchors, channels, 1, a);
            float w = at(data, ncFirst, anchors, channels, 2, a);
            float h = at(data, ncFirst, anchors, channels, 3, a);
            float x1 = cx - w / 2f;
            float y1 = cy - h / 2f;
            float ox = (x1 - pre.padX()) / pre.scaleX();
            float oy = (y1 - pre.padY()) / pre.scaleY();
            float ow = w / pre.scaleX();
            float oh = h / pre.scaleY();
            // clamp to the source bitmap
            float cxl = Math.max(0, Math.min(ox, pre.srcW()));
            float cyl = Math.max(0, Math.min(oy, pre.srcH()));
            ow = Math.max(0, Math.min(ow, pre.srcW() - cxl));
            oh = Math.max(0, Math.min(oh, pre.srcH() - cyl));
            if (ow <= 0 || oh <= 0) {
                continue;
            }
            dets.add(new Detection(bestClass, bestScore, cxl, cyl, ow, oh));
        }
        return nms(dets, spec.getNms(), spec.getIou());
    }

    private static float at(
            float[] data, boolean ncFirst, int anchors, int channels, int c, int a) {
        return ncFirst ? data[c * anchors + a] : data[a * channels + c];
    }

    private static List<Detection> nms(List<Detection> dets, String mode, float iouThreshold) {
        if (dets.size() < 2 || "none".equalsIgnoreCase(mode)) {
            return dets;
        }
        boolean classAgnostic = mode != null && mode.toLowerCase().contains("agnostic");
        List<Detection> sorted = new ArrayList<>(dets);
        sorted.sort((x, y) -> Float.compare(y.score(), x.score()));
        boolean[] removed = new boolean[sorted.size()];
        List<Detection> keep = new ArrayList<>();
        for (int i = 0; i < sorted.size(); i++) {
            if (removed[i]) {
                continue;
            }
            Detection di = sorted.get(i);
            keep.add(di);
            for (int j = i + 1; j < sorted.size(); j++) {
                if (removed[j]) {
                    continue;
                }
                Detection dj = sorted.get(j);
                if (!classAgnostic && di.classId() != dj.classId()) {
                    continue;
                }
                if (iou(di, dj) > iouThreshold) {
                    removed[j] = true;
                }
            }
        }
        return keep;
    }

    private static float iou(Detection a, Detection b) {
        float ax2 = a.x() + a.w();
        float ay2 = a.y() + a.h();
        float bx2 = b.x() + b.w();
        float by2 = b.y() + b.h();
        float ix1 = Math.max(a.x(), b.x());
        float iy1 = Math.max(a.y(), b.y());
        float ix2 = Math.min(ax2, bx2);
        float iy2 = Math.min(ay2, by2);
        float iw = Math.max(0, ix2 - ix1);
        float ih = Math.max(0, iy2 - iy1);
        float inter = iw * ih;
        float union = a.w() * a.h() + b.w() * b.h() - inter;
        return union <= 0 ? 0 : inter / union;
    }

    private static BufferedImage rgbaToImage(byte[] rgba, int w, int h) {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        int[] px = new int[w * h];
        int pixels = Math.min(w * h, rgba.length / 4);
        for (int i = 0; i < pixels; i++) {
            int r = rgba[i * 4] & 0xFF;
            int g = rgba[i * 4 + 1] & 0xFF;
            int b = rgba[i * 4 + 2] & 0xFF;
            int a = rgba[i * 4 + 3] & 0xFF;
            px[i] = (a << 24) | (r << 16) | (g << 8) | b;
        }
        img.setRGB(0, 0, w, h, px, 0, w);
        return img;
    }

    private static int clampByte(int v) {
        return Math.max(0, Math.min(255, v));
    }

    private static float[] orZeros(float[] v) {
        return v != null && v.length >= 3 ? v : new float[] {0f, 0f, 0f};
    }

    private static float[] orOnes(float[] v) {
        return v != null && v.length >= 3 ? v : new float[] {1f, 1f, 1f};
    }
}
