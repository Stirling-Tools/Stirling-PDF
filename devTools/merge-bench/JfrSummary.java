import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import jdk.jfr.consumer.RecordedEvent;
import jdk.jfr.consumer.RecordedFrame;
import jdk.jfr.consumer.RecordedStackTrace;
import jdk.jfr.consumer.RecordingFile;

public class JfrSummary {

    public static void main(String[] a) throws Exception {
        Path jfr = Path.of(a[0]);
        int merges = Integer.parseInt(a[1]);
        long peakRssMb = Long.parseLong(a[2]);
        Map<String, Long> frames = new HashMap<>();
        Map<String, Long> classes = new HashMap<>();
        Map<String, Long> stacks = new HashMap<>();
        long nativeSamples = 0, javaSamples = 0, allocBytes = 0;
        for (RecordedEvent e : RecordingFile.readAllEvents(jfr)) {
            String name = e.getEventType().getName();
            RecordedStackTrace st = e.getStackTrace();
            switch (name) {
                case "jdk.NativeMethodSample", "jdk.ExecutionSample" -> {
                    if (st == null || st.getFrames().isEmpty()) continue;
                    boolean isNative = name.equals("jdk.NativeMethodSample");
                    if (isNative) nativeSamples++; else javaSamples++;
                    RecordedFrame top = st.getFrames().stream()
                            .filter(f -> !plumbing(f.getMethod().getType().getName()))
                            .findFirst().orElse(st.getFrames().getFirst());
                    String key = (isNative ? "native: " : "java: ") + frame(top, top.isJavaFrame());
                    frames.merge(key, 1L, Long::sum);
                }
                case "jdk.ObjectAllocationInNewTLAB", "jdk.ObjectAllocationOutsideTLAB" -> {
                    if (st != null && st.getFrames().stream().anyMatch(f -> recorderOwn(f.getMethod().getType().getName()))) continue;
                    long bytes = name.endsWith("InNewTLAB") ? e.getLong("tlabSize") : e.getLong("allocationSize");
                    allocBytes += bytes;
                    classes.merge(e.getClass("objectClass").getName(), bytes, Long::sum);
                    if (st != null) {
                        String key = st.getFrames().stream().limit(4).map(f -> frame(f, true))
                                .collect(Collectors.joining(" → "));
                        stacks.merge(key, bytes, Long::sum);
                    }
                }
                default -> {}
            }
        }
        long totalSamples = nativeSamples + javaSamples;
        StringBuilder o = new StringBuilder("{");
        o.append("\"merges\":").append(merges)
                .append(",\"native_samples\":").append(nativeSamples)
                .append(",\"java_samples\":").append(javaSamples)
                .append(",\"alloc_mb_per_merge\":").append(String.format("%.4f", allocBytes / 1048576.0 / merges))
                .append(",\"peak_rss_mb\":").append(peakRssMb);
        o.append(",\"frames\":").append(top(frames, 10, v -> String.format("{\"samples\":%d,\"pct\":%.2f}", v, 100.0 * v / Math.max(1, totalSamples))));
        o.append(",\"classes\":").append(top(classes, 8, v -> String.format("{\"mb\":%.2f}", v / 1048576.0)));
        o.append(",\"stacks\":").append(top(stacks, 5, v -> String.format("{\"mb\":%.2f}", v / 1048576.0)));
        Files.writeString(Path.of(a[3]), o.append("}\n").toString());
    }

    static boolean recorderOwn(String type) {
        return type.startsWith("jdk.jfr.") || type.startsWith("jdk.internal.classfile.");
    }

    static boolean plumbing(String type) {
        return type.startsWith("java.lang.invoke.") || type.startsWith("jdk.internal.foreign.") || type.contains("$$Lambda");
    }

    static String frame(RecordedFrame f, boolean withLine) {
        String s = f.getMethod().getType().getName() + "." + f.getMethod().getName();
        return withLine && f.getLineNumber() > 0 ? s + ":" + f.getLineNumber() : s;
    }

    static String top(Map<String, Long> m, int n, java.util.function.LongFunction<String> value) {
        List<Map.Entry<String, Long>> es = new ArrayList<>(m.entrySet());
        es.sort(Map.Entry.<String, Long>comparingByValue().reversed());
        return es.stream().limit(n).map(e -> {
            String v = value.apply(e.getValue());
            return "{\"name\":" + json(e.getKey()) + "," + v.substring(1);
        }).collect(Collectors.joining(",", "[", "]"));
    }

    static String json(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }
}
