package stirling.software.common.util;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.apache.commons.io.FileUtils;

import lombok.extern.slf4j.Slf4j;

/**
 * Per-job confinement for the soffice conversions Java launches itself (office fallback, PDF/A,
 * PDF-to-office). The shared policy exported by the init script lets LibreOffice write anywhere the
 * Java user can, including other jobs' files under the shared temp dir; this narrows it to the
 * job's own profile and output directory, read access to its input files, and a socket-only grant
 * on /tmp. The variables are read by {@code docker/base/lo-sandbox.c}; outside the Docker image
 * soffice is the real binary and ignores them.
 */
@Slf4j
final class LibreOfficeSandboxPolicy {

    static final String IPC_PIPE_DIR = "/tmp";
    private static final String IPC_PIPE_PREFIX = "OSL_PIPE_";
    private static final String USER_INSTALLATION_PREFIX = "-env:UserInstallation=";

    /** soffice options whose value is the next argument rather than an input document. */
    private static final Set<String> OPTIONS_WITH_VALUE =
            Set.of("--convert-to", "--outdir", "--print-to-file", "--printer-name");

    private static final String PROFILE_TMP_DIR = "tmp";
    private static final Object TEMPLATE_LOCK = new Object();
    private static volatile Path profileTemplate;

    /** Environment for one soffice run and the profile it will use. */
    record JobPolicy(Map<String, String> env, Path profile) {}

    private LibreOfficeSandboxPolicy() {}

    /**
     * Environment overrides confining {@code command} to its own files, or empty when the command
     * is not a direct soffice conversion or its paths cannot be expressed in the colon-separated
     * lists lo-sandbox reads, in which case the inherited shared policy still applies.
     */
    static Optional<JobPolicy> forCommand(List<String> command) {
        Path profile = null;
        Path outDir = null;
        List<Path> inputs = new ArrayList<>();
        for (int i = 1; i < command.size(); i++) {
            String arg = command.get(i);
            if (arg.startsWith(USER_INSTALLATION_PREFIX)) {
                profile = toPath(arg.substring(USER_INSTALLATION_PREFIX.length()));
            } else if ("--outdir".equals(arg) && i + 1 < command.size()) {
                outDir = toPath(command.get(++i));
            } else if (OPTIONS_WITH_VALUE.contains(arg)) {
                i++;
            } else if (!arg.startsWith("-")) {
                Path input = toPath(arg);
                if (input != null && Files.isRegularFile(input)) {
                    inputs.add(input.toAbsolutePath().normalize());
                }
            }
        }
        if (profile == null || outDir == null || !listable(profile, outDir, inputs)) {
            return Optional.empty();
        }
        profile = profile.toAbsolutePath().normalize();
        outDir = outDir.toAbsolutePath().normalize();
        Path tmp = profile.resolve(PROFILE_TMP_DIR);
        try {
            Files.createDirectories(tmp);
            Files.createDirectories(outDir);
        } catch (IOException e) {
            log.warn("Cannot prepare LibreOffice job dirs under {}: {}", profile, e.getMessage());
            return Optional.empty();
        }

        Map<String, String> env = new LinkedHashMap<>();
        env.put("STIRLING_LO_ALLOW_RW", profile + ":" + outDir + ":/dev");
        env.put("STIRLING_LO_ALLOW_SOCK", IPC_PIPE_DIR);
        env.put("STIRLING_LO_ALLOW_RO_EXTRA", join(inputs));
        env.put("HOME", profile.toString());
        for (String name : List.of("TMPDIR", "TMP", "TEMP", "SAL_TMP", "XDG_RUNTIME_DIR")) {
            env.put(name, tmp.toString());
        }
        return Optional.of(new JobPolicy(env, profile));
    }

    /**
     * Copies an initialised profile into {@code profile} when it has none yet. A fresh profile
     * makes soffice exit with its restart code and relaunch under the same IPC pipe name; the
     * relaunch cannot unlink the first pipe on the socket-only /tmp and exits 1, so every job with
     * a fresh profile would fail its first attempt.
     */
    static void seedProfile(Path profile) {
        Path template = profileTemplate;
        if (template == null || Files.exists(profile.resolve("user"))) {
            return;
        }
        if (!Files.isDirectory(template)) {
            profileTemplate = null;
            return;
        }
        try {
            copyTree(template, profile);
        } catch (IOException e) {
            log.debug("Cannot seed LibreOffice profile {}: {}", profile, e.getMessage());
        }
    }

    /** Keeps the first profile a run initialised as the template {@link #seedProfile} copies. */
    static void rememberProfile(Path profile, Path templateRoot) {
        if (profileTemplate != null || !Files.isDirectory(profile.resolve("user"))) {
            return;
        }
        synchronized (TEMPLATE_LOCK) {
            if (profileTemplate != null) {
                return;
            }
            Path template =
                    templateRoot.resolve(
                            "stirling-lo-profile-template-" + ProcessHandle.current().pid());
            try {
                FileUtils.deleteDirectory(template.toFile());
                copyTree(profile, template);
                profileTemplate = template;
            } catch (IOException e) {
                log.debug("Cannot keep LibreOffice profile template: {}", e.getMessage());
                FileUtils.deleteQuietly(template.toFile());
            }
        }
    }

    private static void copyTree(Path from, Path to) throws IOException {
        Path excluded = from.resolve(PROFILE_TMP_DIR);
        try (var paths = Files.walk(from)) {
            for (Path source : (Iterable<Path>) paths::iterator) {
                if (source.startsWith(excluded)) {
                    continue;
                }
                Path target = to.resolve(from.relativize(source).toString());
                if (Files.isDirectory(source, LinkOption.NOFOLLOW_LINKS)) {
                    Files.createDirectories(target);
                } else if (Files.isRegularFile(source, LinkOption.NOFOLLOW_LINKS)) {
                    Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
                }
            }
        }
    }

    /**
     * True when {@code profile} has no initialised user layer, so soffice will initialise it and
     * relaunch on this run. Only such a run leaves the unbindable IPC pipe the retry handles, so
     * the caller gates its retry on this rather than on the shared /tmp sweep, which under parallel
     * load reports pipes other jobs left behind.
     */
    static boolean isProfileUninitialised(Path profile) {
        return !Files.exists(profile.resolve("user"));
    }

    /** IPC pipe files present before a run, so only the run's own leftovers are removed. */
    static Set<Path> snapshotIpcPipes(Path dir) {
        Set<Path> pipes = new HashSet<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir, IPC_PIPE_PREFIX + "*")) {
            stream.forEach(pipes::add);
        } catch (IOException e) {
            log.debug("Cannot list {}: {}", dir, e.getMessage());
        }
        return pipes;
    }

    /**
     * Removes IPC pipes a sandboxed soffice created but could not unlink, which it is denied on the
     * socket-only /tmp, and reports whether any were found. Pipes still bound in {@code
     * /proc/net/unix} belong to a live instance and are kept.
     */
    static boolean removeLeftoverIpcPipes(Path dir, Set<Path> before) {
        Set<Path> created = snapshotIpcPipes(dir);
        created.removeAll(before);
        if (created.isEmpty()) {
            return false;
        }
        boolean removed = false;
        Set<String> bound = readBoundUnixSocketPaths();
        for (Path pipe : created) {
            if (bound.contains(pipe.toString()) || !isSocket(pipe)) {
                continue;
            }
            try {
                removed |= Files.deleteIfExists(pipe);
            } catch (IOException e) {
                log.debug("Cannot remove LibreOffice IPC pipe {}: {}", pipe, e.getMessage());
            }
        }
        return removed;
    }

    /** Paths of bound UNIX sockets: the last column of each {@code /proc/net/unix} row. */
    private static Set<String> readBoundUnixSocketPaths() {
        Set<String> paths = new HashSet<>();
        try {
            for (String line :
                    Files.readAllLines(Path.of("/proc/net/unix"), StandardCharsets.UTF_8)) {
                String[] columns = line.trim().split("\\s+");
                if (columns.length >= 8 && columns[columns.length - 1].startsWith("/")) {
                    paths.add(columns[columns.length - 1]);
                }
            }
        } catch (IOException e) {
            log.debug("Cannot read /proc/net/unix: {}", e.getMessage());
        }
        return paths;
    }

    private static boolean isSocket(Path path) {
        try {
            return Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS)
                    .isOther();
        } catch (IOException e) {
            return false;
        }
    }

    private static Path toPath(String value) {
        try {
            return value.startsWith("file:") ? Path.of(URI.create(value)) : Path.of(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static boolean listable(Path profile, Path outDir, List<Path> inputs) {
        if (profile.toString().contains(":") || outDir.toString().contains(":")) {
            return false;
        }
        return inputs.stream().noneMatch(p -> p.toString().contains(":"));
    }

    private static String join(List<Path> paths) {
        return String.join(":", paths.stream().map(Path::toString).toList());
    }
}
