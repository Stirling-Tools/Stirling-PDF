package stirling.software.common.util.misc;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import lombok.extern.slf4j.Slf4j;

/**
 * Resolves a redistributable CMYK ICC profile for RGB-to-CMYK conversion.
 *
 * <p>An operator can point {@code -Dstirling.cmyk.icc=/path/profile.icc} or {@code
 * STIRLING_CMYK_ICC_PROFILE} at a print profile. When neither is set, the profile shipped with an
 * installed Ghostscript is used if one can be found; otherwise the caller falls back to JPDFium's
 * compact generic profile. Reading a profile never invokes Ghostscript and does not make it a
 * runtime process dependency.
 */
@Slf4j
public final class CmykProfileResolver {

    private static final String PROPERTY = "stirling.cmyk.icc";
    private static final String ENVIRONMENT = "STIRLING_CMYK_ICC_PROFILE";
    private static final Pattern ABSOLUTE_PATH = Pattern.compile("(/[^\\s:]+)");

    private static volatile boolean resolved;
    private static volatile byte[] profile;
    private static volatile String source;

    private CmykProfileResolver() {}

    /** Returns a copy of the resolved profile, or {@code null} when none is available. */
    public static byte[] profile() {
        ensureResolved();
        byte[] value = profile;
        return value == null ? null : value.clone();
    }

    /** Human-readable origin of the resolved profile, or {@code null}. */
    public static String source() {
        ensureResolved();
        return source;
    }

    private static synchronized void ensureResolved() {
        if (resolved) return;
        resolved = true;

        String explicit = System.getProperty(PROPERTY);
        if (explicit == null || explicit.isBlank()) {
            explicit = System.getenv(ENVIRONMENT);
        }
        if (explicit != null && !explicit.isBlank()) {
            byte[] loaded = read(Path.of(explicit.trim()));
            if (loaded != null) {
                profile = loaded;
                source = explicit.trim();
                log.info("Using CMYK ICC profile from {}", source);
                return;
            }
            log.warn("Configured CMYK ICC profile is not readable: {}", explicit);
        }

        Path ghostscriptProfile = findGhostscriptProfile();
        if (ghostscriptProfile != null) {
            byte[] loaded = read(ghostscriptProfile);
            if (loaded != null) {
                profile = loaded;
                source = ghostscriptProfile.toString();
                log.info("Using Ghostscript CMYK ICC profile from {}", source);
            }
        }
    }

    private static byte[] read(Path path) {
        try {
            if (Files.isRegularFile(path) && Files.size(path) > 0) {
                return Files.readAllBytes(path);
            }
        } catch (IOException e) {
            log.debug("Could not read CMYK ICC profile {}", path, e);
        }
        return null;
    }

    private static Path findGhostscriptProfile() {
        for (Path searchPath : ghostscriptSearchPaths()) {
            Path current = searchPath;
            for (int depth = 0;
                    depth < 5 && current != null;
                    depth++, current = current.getParent()) {
                Path candidate = current.resolve("iccprofiles/default_cmyk.icc");
                if (Files.isRegularFile(candidate)) return candidate;
            }
        }
        return null;
    }

    private static List<Path> ghostscriptSearchPaths() {
        List<Path> paths = new ArrayList<>();
        Process process = null;
        try {
            process = new ProcessBuilder("gs", "-h").redirectErrorStream(true).start();
            String output =
                    new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            if (!process.waitFor(5, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return paths;
            }
            Matcher matcher = ABSOLUTE_PATH.matcher(output);
            while (matcher.find()) {
                Path candidate = Path.of(matcher.group(1));
                if (Files.isDirectory(candidate)) paths.add(candidate);
            }
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            log.debug("Could not query Ghostscript's ICC profile path", e);
        } finally {
            if (process != null && process.isAlive()) process.destroyForcibly();
        }
        return paths;
    }
}
