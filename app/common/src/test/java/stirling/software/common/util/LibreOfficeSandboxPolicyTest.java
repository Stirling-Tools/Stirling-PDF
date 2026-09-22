package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.net.StandardProtocolFamily;
import java.net.UnixDomainSocketAddress;
import java.nio.channels.ServerSocketChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LibreOfficeSandboxPolicyTest {

    @TempDir Path tmp;

    private List<String> sofficeCommand(Path profile, Path outDir, Path input) {
        return List.of(
                "/usr/bin/soffice",
                "-env:UserInstallation=" + profile.toUri(),
                "--headless",
                "--nologo",
                "--convert-to",
                "pdf:writer_pdf_Export:{\"SelectPdfVersion\":{\"type\":\"long\",\"value\":\"2\"}}",
                "--outdir",
                outDir.toString(),
                input.toString());
    }

    @Test
    void confinesDirectConversionToItsOwnFiles() throws IOException {
        Path profile = tmp.resolve("libreoffice_profile_1");
        Path outDir = tmp.resolve("output_1");
        Path input = Files.writeString(tmp.resolve("in.docx"), "x");

        LibreOfficeSandboxPolicy.JobPolicy policy =
                LibreOfficeSandboxPolicy.forCommand(sofficeCommand(profile, outDir, input))
                        .orElseThrow();
        Map<String, String> env = policy.env();

        assertEquals(profile, policy.profile());

        assertEquals(profile + ":" + outDir + ":/dev", env.get("STIRLING_LO_ALLOW_RW"));
        assertEquals(input.toString(), env.get("STIRLING_LO_ALLOW_RO_EXTRA"));
        assertEquals("/tmp", env.get("STIRLING_LO_ALLOW_SOCK"));
        assertEquals(profile.toString(), env.get("HOME"));
        for (String name : List.of("TMPDIR", "TMP", "TEMP", "SAL_TMP", "XDG_RUNTIME_DIR")) {
            assertEquals(profile.resolve("tmp").toString(), env.get(name), name);
        }
        assertTrue(Files.isDirectory(profile.resolve("tmp")));
        assertTrue(Files.isDirectory(outDir));
    }

    @Test
    void convertToFilterValueIsNotTreatedAsInput() throws IOException {
        Path input = Files.writeString(tmp.resolve("in.pdf"), "x");
        Files.writeString(tmp.resolve("pdf"), "decoy");

        Map<String, String> env =
                LibreOfficeSandboxPolicy.forCommand(
                                List.of(
                                        "soffice",
                                        "-env:UserInstallation=" + tmp.resolve("p").toUri(),
                                        "--convert-to",
                                        tmp.resolve("pdf").toString(),
                                        "--outdir",
                                        tmp.resolve("o").toString(),
                                        input.toString()))
                        .orElseThrow()
                        .env();

        assertEquals(input.toString(), env.get("STIRLING_LO_ALLOW_RO_EXTRA"));
    }

    @Test
    void unoconvertCommandIsLeftToSharedPolicy() {
        assertEquals(
                Optional.empty(),
                LibreOfficeSandboxPolicy.forCommand(
                        List.of(
                                "unoconvert",
                                "--host-location",
                                "remote",
                                "--convert-to",
                                "pdf",
                                "/tmp/a.docx",
                                "/tmp/a.pdf")));
    }

    @Test
    void commandWithoutOutdirIsLeftToSharedPolicy() {
        assertEquals(
                Optional.empty(),
                LibreOfficeSandboxPolicy.forCommand(
                        List.of(
                                "soffice",
                                "-env:UserInstallation=" + tmp.resolve("p").toUri(),
                                "--convert-to",
                                "pdf",
                                "in.docx")));
    }

    @Test
    void pathWithListSeparatorIsLeftToSharedPolicy() throws IOException {
        Path odd = Files.createDirectories(tmp.resolve("a:b"));
        Path input = Files.writeString(tmp.resolve("in.docx"), "x");

        assertEquals(
                Optional.empty(),
                LibreOfficeSandboxPolicy.forCommand(
                        sofficeCommand(odd.resolve("profile"), tmp.resolve("out"), input)));
    }

    @Test
    void seedsFreshProfilesFromTheFirstInitialisedOne() throws IOException {
        Path first = tmp.resolve("profile_a");
        Files.createDirectories(first.resolve("user/config"));
        Files.writeString(first.resolve("user/registrymodifications.xcu"), "<items/>");
        Files.createDirectories(first.resolve("tmp"));
        Files.writeString(first.resolve("tmp/scratch"), "job data");

        LibreOfficeSandboxPolicy.rememberProfile(first, tmp);
        Path fresh = tmp.resolve("profile_b");
        LibreOfficeSandboxPolicy.seedProfile(fresh);

        assertEquals("<items/>", Files.readString(fresh.resolve("user/registrymodifications.xcu")));
        assertTrue(Files.isDirectory(fresh.resolve("user/config")));
        assertFalse(Files.exists(fresh.resolve("tmp/scratch")), "job scratch is not templated");

        Path existing = tmp.resolve("profile_c");
        Files.createDirectories(existing.resolve("user"));
        Files.writeString(existing.resolve("user/registrymodifications.xcu"), "<own/>");
        LibreOfficeSandboxPolicy.seedProfile(existing);
        assertEquals(
                "<own/>", Files.readString(existing.resolve("user/registrymodifications.xcu")));
    }

    @Test
    void reportsWhetherProfileIsUninitialised() throws IOException {
        Path fresh = tmp.resolve("fresh");
        Files.createDirectories(fresh);
        assertTrue(LibreOfficeSandboxPolicy.isProfileUninitialised(fresh));

        Files.createDirectories(fresh.resolve("user"));
        assertFalse(LibreOfficeSandboxPolicy.isProfileUninitialised(fresh));
    }

    @Test
    void removesOnlyUnboundPipesCreatedDuringTheRun() throws IOException {
        Path preexisting = Files.writeString(tmp.resolve("OSL_PIPE_1000_old"), "");
        Set<Path> before = LibreOfficeSandboxPolicy.snapshotIpcPipes(tmp);

        Path stale = tmp.resolve("OSL_PIPE_1000_SingleOfficeIPC_stale");
        Path live = tmp.resolve("OSL_PIPE_1000_SingleOfficeIPC_live");
        Path regular = Files.writeString(tmp.resolve("OSL_PIPE_1000_notasocket"), "");
        try (ServerSocketChannel staleChannel =
                        ServerSocketChannel.open(StandardProtocolFamily.UNIX);
                ServerSocketChannel liveChannel =
                        ServerSocketChannel.open(StandardProtocolFamily.UNIX)) {
            staleChannel.bind(UnixDomainSocketAddress.of(stale));
            liveChannel.bind(UnixDomainSocketAddress.of(live));
            staleChannel.close();
            assertTrue(Files.exists(stale), "closing a bound channel leaves its file behind");

            assertTrue(LibreOfficeSandboxPolicy.removeLeftoverIpcPipes(tmp, before));

            assertFalse(Files.exists(stale));
            assertTrue(Files.exists(live), "a pipe still bound belongs to a running instance");
        }
        assertTrue(Files.exists(preexisting));
        assertTrue(Files.exists(regular));
        assertFalse(
                LibreOfficeSandboxPolicy.removeLeftoverIpcPipes(
                        tmp, LibreOfficeSandboxPolicy.snapshotIpcPipes(tmp)));
    }
}
