package stirling.software.common.pdf.worker;

import java.io.File;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/** Builds the command that starts a worker JVM on the server's own classpath. */
final class PdfWorkerLauncher {

    private static final String BOOT_PROPERTIES_LAUNCHER =
            "org.springframework.boot.loader.launch.PropertiesLauncher";

    private PdfWorkerLauncher() {}

    /** Returns the java binary followed by the worker's JVM arguments. */
    static List<String> command(String maxHeap, Class<?> mainClass) {
        List<String> args = new ArrayList<>();
        args.add("-Xmx" + maxHeap);
        args.add("-XX:+UseSerialGC");
        args.add("-XX:TieredStopAtLevel=1");
        args.add("-XX:+ExitOnOutOfMemoryError");
        args.add("--enable-native-access=ALL-UNNAMED");
        args.add("-Djava.awt.headless=true");
        args.add("-Dfile.encoding=UTF-8");
        args.add("-Djava.io.tmpdir=" + System.getProperty("java.io.tmpdir"));
        args.add("-Dlogback.configurationFile=logback-pdf-worker.xml");
        System.getProperties().stringPropertyNames().stream()
                .filter(name -> name.startsWith("jpdfium.") && !name.equals("jpdfium.native.sweep"))
                .sorted()
                .forEach(name -> args.add("-D" + name + "=" + System.getProperty(name)));
        // Each worker must not sweep native libraries another JVM still has mapped.
        args.add("-Djpdfium.native.sweep=false");

        String classPath = System.getProperty("java.class.path");
        args.add("-cp");
        args.add(classPath);
        if (onClassPath(mainClass, classPath)) {
            args.add(mainClass.getName());
        } else {
            // Packaged Spring Boot jar: classes live in nested jars only the Boot loader can read.
            args.add("-Dloader.main=" + mainClass.getName());
            args.add(BOOT_PROPERTIES_LAUNCHER);
        }

        args.addFirst(javaBinary());
        return List.copyOf(args);
    }

    static boolean onClassPath(Class<?> type, String classPath) {
        URL location = type.getProtectionDomain().getCodeSource().getLocation();
        if (location == null || !"file".equals(location.getProtocol())) {
            return false;
        }
        Path own;
        try {
            own = Path.of(location.toURI()).toAbsolutePath().normalize();
        } catch (URISyntaxException | IllegalArgumentException e) {
            return false;
        }
        return Arrays.stream(classPath.split(File.pathSeparator))
                        .filter(entry -> !entry.isBlank() && !entry.endsWith("*"))
                        .map(entry -> Path.of(entry).toAbsolutePath().normalize())
                        .anyMatch(own::equals)
                || inWildcardDir(own, classPath);
    }

    private static boolean inWildcardDir(Path own, String classPath) {
        return Arrays.stream(classPath.split(File.pathSeparator))
                .filter(entry -> entry.endsWith("*"))
                .map(entry -> Path.of(entry.substring(0, entry.length() - 1)).toAbsolutePath())
                .anyMatch(dir -> dir.normalize().equals(own.getParent()));
    }

    static String javaBinary() {
        return ProcessHandle.current()
                .info()
                .command()
                .orElseGet(
                        () -> {
                            boolean windows =
                                    System.getProperty("os.name", "")
                                            .toLowerCase(Locale.ROOT)
                                            .contains("win");
                            return Path.of(
                                            System.getProperty("java.home"),
                                            "bin",
                                            windows ? "java.exe" : "java")
                                    .toString();
                        });
    }

    /** Argfile quoting: wrap in quotes, escape backslashes and quotes. */
    static String quote(String arg) {
        return '"' + arg.replace("\\", "\\\\").replace("\"", "\\\"") + '"';
    }
}
