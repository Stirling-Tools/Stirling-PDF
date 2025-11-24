package stirling.software.SPDF.config;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.util.RegexPatternUtils;

/**
 * Dependency checker that - runs probes in parallel with timeouts (prevents hanging on broken
 * PATHs) - supports Windows+Unix in a single place - de-duplicates logic for version extraction &
 * command availability - keeps group <-> command mapping and feature formatting tidy & immutable
 */
@Configuration
@Slf4j
public class ExternalAppDepConfig {

    private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(5);
    private static final Pattern VERSION_PATTERN = Pattern.compile("(\\d+(?:\\.\\d+){0,2})");

    private final EndpointConfiguration endpointConfiguration;

    private final boolean isWindows =
            System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("windows");

    private final String weasyprintPath;
    private final String unoconvPath;
    private final String calibrePath;
    private final String ocrMyPdfPath;
    private final String sOfficePath;

    /**
     * Map of command(binary) -> affected groups (e.g. "gs" -> ["Ghostscript"]). Immutable to avoid
     * accidental mutations.
     */
    private final Map<String, List<String>> commandToGroupMapping;

    private final ExecutorService pool =
            Executors.newFixedThreadPool(
                    Math.max(2, Runtime.getRuntime().availableProcessors() / 2));

    public ExternalAppDepConfig(
            EndpointConfiguration endpointConfiguration, RuntimePathConfig runtimePathConfig) {
        this.endpointConfiguration = endpointConfiguration;
        this.weasyprintPath = runtimePathConfig.getWeasyPrintPath();
        this.unoconvPath = runtimePathConfig.getUnoConvertPath();
        this.calibrePath = runtimePathConfig.getCalibrePath();
        this.ocrMyPdfPath = runtimePathConfig.getOcrMyPdfPath();
        this.sOfficePath = runtimePathConfig.getSOfficePath();

        Map<String, List<String>> tmp = new HashMap<>();
        tmp.put("gs", List.of("Ghostscript"));
        tmp.put(ocrMyPdfPath, List.of("OCRmyPDF"));
        tmp.put(sOfficePath, List.of("LibreOffice"));
        tmp.put(weasyprintPath, List.of("Weasyprint"));
        tmp.put("pdftohtml", List.of("Pdftohtml"));
        tmp.put(unoconvPath, List.of("Unoconvert"));
        tmp.put("qpdf", List.of("qpdf"));
        tmp.put("tesseract", List.of("tesseract"));
        tmp.put("rar", List.of("rar"));
        tmp.put(calibrePath, List.of("Calibre"));
        tmp.put("ffmpeg", List.of("FFmpeg"));
        this.commandToGroupMapping = Collections.unmodifiableMap(tmp);
    }

    @PostConstruct
    public void checkDependencies() {
        try {
            // core checks in parallel
            List<Callable<Void>> tasks =
                    commandToGroupMapping.keySet().stream()
                            .<Callable<Void>>map(
                                    cmd ->
                                            () -> {
                                                checkDependencyAndDisableGroup(cmd);
                                                return null;
                                            })
                            .collect(Collectors.toList());
            invokeAllWithTimeout(tasks, DEFAULT_TIMEOUT.plusSeconds(3));

            // Python / OpenCV special handling
            checkPythonAndOpenCV();
        } finally {
            endpointConfiguration.logDisabledEndpointsSummary();
            pool.shutdown();
        }
    }

    private void checkDependencyAndDisableGroup(String command) {
        boolean available = isCommandAvailable(command);

        if (!available) {
            List<String> affectedGroups = commandToGroupMapping.get(command);
            if (affectedGroups == null || affectedGroups.isEmpty()) return;

            for (String group : affectedGroups) {
                List<String> affectedFeatures = getAffectedFeatures(group);
                endpointConfiguration.disableGroup(group);
                log.warn(
                        "Missing dependency: {} - Disabling group: {} (Affected features: {})",
                        command,
                        group,
                        affectedFeatures.isEmpty()
                                ? "unknown"
                                : String.join(", ", affectedFeatures));
            }
            return;
        }

        // Extra: enforce minimum WeasyPrint version if command matches
        if (isWeasyprint(command)) {
            Optional<String> version = getVersionSafe(command, "--version");
            version.ifPresentOrElse(
                    v -> {
                        Version installed = new Version(v);
                        // https://www.courtbouillon.org/blog/00040-weasyprint-58/
                        Version required = new Version("58.0");
                        if (installed.compareTo(required) < 0) {
                            List<String> affectedGroups =
                                    commandToGroupMapping.getOrDefault(
                                            command, List.of("Weasyprint"));
                            for (String group : affectedGroups) {
                                endpointConfiguration.disableGroup(group);
                            }
                            log.warn(
                                    "WeasyPrint version {} is below required {} - disabling"
                                            + " group(s): {}",
                                    installed,
                                    required,
                                    String.join(", ", affectedGroups));
                        } else {
                            log.info("WeasyPrint {} meets minimum {}", installed, required);
                        }
                    },
                    () ->
                            log.warn(
                                    "WeasyPrint version could not be determined ({} --version)",
                                    command));
        }

        // Extra: enforce minimum qpdf version if command matches
        if (isQpdf(command)) {
            Optional<String> version = getVersionSafe(command, "--version");
            version.ifPresentOrElse(
                    v -> {
                        Version installed = new Version(v);
                        Version required = new Version("12.0.0");
                        if (installed.compareTo(required) < 0) {
                            List<String> affectedGroups =
                                    commandToGroupMapping.getOrDefault(command, List.of("qpdf"));
                            for (String group : affectedGroups) {
                                endpointConfiguration.disableGroup(group);
                            }
                            log.warn(
                                    "qpdf version {} is below required {} - disabling group(s): {}",
                                    installed,
                                    required,
                                    String.join(", ", affectedGroups));
                        } else {
                            log.info("qpdf {} meets minimum {}", installed, required);
                        }
                    },
                    () -> log.warn("qpdf version could not be determined ({} --version)", command));
        }
    }

    private boolean isWeasyprint(String command) {
        return Objects.equals(command, weasyprintPath)
                || command.toLowerCase(Locale.ROOT).contains("weasyprint");
    }

    private boolean isQpdf(String command) {
        return command.toLowerCase(Locale.ROOT).contains("qpdf");
    }

    private List<String> getAffectedFeatures(String group) {
        List<String> endpoints = new ArrayList<>(endpointConfiguration.getEndpointsForGroup(group));
        return endpoints.stream().map(this::formatEndpointAsFeature).toList();
    }

    private String formatEndpointAsFeature(String endpoint) {
        String feature = endpoint.replace("-", " ").replace("pdf", "PDF").replace("img", "image");
        return Arrays.stream(RegexPatternUtils.getInstance().getWordSplitPattern().split(feature))
                .map(this::capitalizeWord)
                .collect(Collectors.joining(" "));
    }

    private String capitalizeWord(String word) {
        if (word == null || word.isEmpty()) return word;
        if ("pdf".equalsIgnoreCase(word)) return "PDF";
        return word.substring(0, 1).toUpperCase(Locale.ROOT)
                + word.substring(1).toLowerCase(Locale.ROOT);
    }

    private void checkPythonAndOpenCV() {
        String python = findFirstAvailable(List.of("python3", "python")).orElse(null);
        if (python == null) {
            disablePythonAndOpenCV("Python interpreter not found on PATH");
            return;
        }

        // Check OpenCV import
        int ec = runAndWait(List.of(python, "-c", "import cv2"), DEFAULT_TIMEOUT).exitCode();
        if (ec != 0) {
            List<String> openCVFeatures = getAffectedFeatures("OpenCV");
            endpointConfiguration.disableGroup("OpenCV");
            log.warn(
                    "OpenCV not available in Python - Disabling OpenCV features: {}",
                    String.join(", ", openCVFeatures));
        }
    }

    private void disablePythonAndOpenCV(String reason) {
        List<String> pythonFeatures = getAffectedFeatures("Python");
        List<String> openCVFeatures = getAffectedFeatures("OpenCV");
        endpointConfiguration.disableGroup("Python");
        endpointConfiguration.disableGroup("OpenCV");
        log.warn(
                "Missing dependency: Python (reason: {}) - Disabling Python features: {} and OpenCV"
                        + " features: {}",
                reason,
                String.join(", ", pythonFeatures),
                String.join(", ", openCVFeatures));
    }

    private Optional<String> findFirstAvailable(List<String> commands) {
        for (String c : commands) {
            if (isCommandAvailable(c)) return Optional.of(c);
        }
        return Optional.empty();
    }

    private boolean isCommandAvailable(String command) {
        // First try OS-native lookup
        List<String> lookup = isWindows ? List.of("where", command) : List.of("which", command);
        ProbeResult res = runAndWait(lookup, DEFAULT_TIMEOUT);
        if (res.exitCode() == 0) return true;

        // Fallback: try `--version` when helpful (covers py-launcher shims on Windows etc.)
        ProbeResult ver = runAndWait(List.of(command, "--version"), DEFAULT_TIMEOUT);
        return ver.exitCode() == 0;
    }

    private Optional<String> getVersionSafe(String command, String arg) {
        try {
            ProbeResult res = runAndWait(List.of(command, arg), DEFAULT_TIMEOUT);
            if (res.exitCode() != 0) return Optional.empty();
            String text = res.combined();
            Matcher m = VERSION_PATTERN.matcher(text);
            return m.find() ? Optional.of(m.group(1)) : Optional.empty();
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private void invokeAllWithTimeout(List<Callable<Void>> tasks, Duration timeout) {
        try {
            List<Future<Void>> futures =
                    pool.invokeAll(tasks, timeout.toMillis(), TimeUnit.MILLISECONDS);
            for (Future<Void> f : futures) {
                try {
                    f.get();
                } catch (Exception ignored) {
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private ProbeResult runAndWait(List<String> cmd, Duration timeout) {
        ProcessBuilder pb = new ProcessBuilder(cmd);
        try {
            Process p = pb.start();
            boolean finished = p.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (!finished) {
                p.destroyForcibly();
                return new ProbeResult(124, "", "timeout");
            }
            String out = readStream(p.getInputStream());
            String err = readStream(p.getErrorStream());
            int ec = p.exitValue();
            return new ProbeResult(ec, out, err);
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return new ProbeResult(127, "", String.valueOf(e.getMessage()));
        }
    }

    private static String readStream(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br =
                new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(line);
            }
        }
        return sb.toString().trim();
    }

    private record ProbeResult(int exitCode, String stdout, String stderr) {
        String combined() {
            return (stdout == null ? "" : stdout) + "\n" + (stderr == null ? "" : stderr);
        }
    }

    /** Simple numeric version comparator (major.minor.patch). */
    static class Version implements Comparable<Version> {
        private final int[] parts;

        Version(String ver) {
            String[] tokens = ver.split("\\.");
            parts = new int[3];
            for (int i = 0; i < 3; i++) {
                if (i < tokens.length) {
                    try {
                        parts[i] = Integer.parseInt(tokens[i]);
                    } catch (NumberFormatException e) {
                        parts[i] = 0;
                    }
                } else {
                    parts[i] = 0;
                }
            }
        }

        @Override
        public int compareTo(Version o) {
            for (int i = 0; i < 3; i++) {
                int a = parts[i];
                int b = o.parts[i];
                if (a != b) return Integer.compare(a, b);
            }
            return 0;
        }

        @Override
        public String toString() {
            return parts[0] + "." + parts[1] + "." + parts[2];
        }
    }
}
