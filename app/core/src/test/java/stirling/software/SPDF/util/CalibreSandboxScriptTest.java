package stirling.software.SPDF.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.util.GeneralUtils;

@EnabledOnOs(OS.LINUX)
class CalibreSandboxScriptTest {

    @TempDir Path workDir;
    @TempDir Path elsewhere;

    private Path launcher;

    @BeforeEach
    void requireASandboxCapableHost() throws Exception {
        launcher = GeneralUtils.extractScript("calibre_sandbox.py").toAbsolutePath();
        int rc;
        try {
            rc = confined("/usr/bin/true");
        } catch (IOException e) {
            rc = -1;
        }
        assumeTrue(rc == 0, "python3, Landlock or seccomp unavailable");
    }

    private int confined(String... command) throws Exception {
        List<String> full =
                new ArrayList<>(List.of("python3", "-I", launcher.toString(), workDir.toString()));
        full.addAll(List.of(command));
        ProcessBuilder builder = new ProcessBuilder(full).directory(workDir.toFile());
        builder.environment().put("STIRLING_CALIBRE_SANDBOX", "required");
        builder.redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD);
        Process process = builder.start();
        if (!process.waitFor(60, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IllegalStateException("launcher did not finish");
        }
        return process.exitValue();
    }

    @Test
    @DisplayName("the job's own files can be read and written")
    void workingDirectoryIsUsable() throws Exception {
        Path book = Files.writeString(workDir.resolve("book.txt"), "book");

        assertEquals(0, confined("/usr/bin/cp", book.toString(), workDir + "/copy.txt"));
        assertEquals("book", Files.readString(workDir.resolve("copy.txt")));
    }

    @Test
    @DisplayName("a file outside the job cannot be read, directly or through a symlink")
    void filesElsewhereAreUnreadable() throws Exception {
        Path secret = Files.writeString(elsewhere.resolve("settings.yml"), "secret");
        Path link = Files.createSymbolicLink(workDir.resolve("cover.jpg"), secret);

        assertNotEquals(0, confined("/usr/bin/cp", secret.toString(), workDir + "/copy.txt"));
        assertNotEquals(0, confined("/usr/bin/cp", link.toString(), workDir + "/copy.txt"));
        assertNotEquals(0, confined("/usr/bin/ls", elsewhere.toString()));
    }

    @Test
    @DisplayName("nothing outside the job can be written")
    void filesElsewhereAreUnwritable() throws Exception {
        Path book = Files.writeString(workDir.resolve("book.txt"), "book");

        assertNotEquals(0, confined("/usr/bin/cp", book.toString(), elsewhere + "/copy.txt"));
        assertFalse(Files.exists(elsewhere.resolve("copy.txt")));
    }

    @Test
    @DisplayName("only UNIX sockets can be opened")
    void networkIsUnreachable() throws Exception {
        assumeTrue(confined("python3", "-I", "-c", "pass") == 0, "python3 is not under /usr");
        String open = "import socket; socket.socket(socket.%s)";

        assertEquals(0, confined("python3", "-I", "-c", open.formatted("AF_UNIX")));
        assertNotEquals(0, confined("python3", "-I", "-c", open.formatted("AF_INET")));
        assertNotEquals(0, confined("python3", "-I", "-c", open.formatted("AF_INET6")));
    }
}
