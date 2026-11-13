package stirling.software.common.util;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public final class JpdfiumNativePreloader {

    static final String MANIFEST = "jpdfium-natives.txt";

    private JpdfiumNativePreloader() {}

    public static void preloadBundledNatives() {
        String javaHome = System.getProperty("java.home");
        if (javaHome == null) {
            return;
        }
        List<Path> libraries = bundledLibraries(Path.of(javaHome));
        for (Path library : libraries) {
            try {
                System.load(library.toString());
            } catch (UnsatisfiedLinkError e) {
                log.warn("Could not preload JPDFium native {}: {}", library, e.getMessage());
            }
        }
        if (!libraries.isEmpty()) {
            log.info(
                    "Preloaded {} JPDFium natives from {}",
                    libraries.size(),
                    libraries.get(0).getParent());
        }
    }

    static List<Path> bundledLibraries(Path javaHome) {
        Path binDir = javaHome.resolve("bin");
        Path manifest = binDir.resolve(MANIFEST);
        if (!Files.isRegularFile(manifest)) {
            return List.of();
        }
        try {
            return Files.readAllLines(manifest, StandardCharsets.UTF_8).stream()
                    .map(String::trim)
                    .filter(name -> !name.isEmpty() && !name.startsWith("#"))
                    .map(binDir::resolve)
                    .filter(Files::isRegularFile)
                    .toList();
        } catch (IOException e) {
            log.warn("Could not read {}: {}", manifest, e.getMessage());
            return List.of();
        }
    }
}
