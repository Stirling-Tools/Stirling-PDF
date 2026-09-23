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
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;

class LibreOfficeSandboxPolicyTest {

    @TempDir Path tmp;

    private List<Path> roots() {
        return List.of(tmp);
    }

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
                LibreOfficeSandboxPolicy.forCommand(sofficeCommand(profile, outDir, input), roots())
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
                                        input.toString()),
                                roots())
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
                                "/tmp/a.pdf"),
                        roots()));
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
                                "in.docx"),
                        roots()));
    }

    @Test
    void pathWithListSeparatorIsLeftToSharedPolicy() throws IOException {
        Path odd = Files.createDirectories(tmp.resolve("a:b"));
        Path input = Files.writeString(tmp.resolve("in.docx"), "x");

        assertEquals(
                Optional.empty(),
                LibreOfficeSandboxPolicy.forCommand(
                        sofficeCommand(odd.resolve("profile"), tmp.resolve("out"), input),
                        roots()));
    }

    @Test
    void pathsOutsideTheWorkRootsAreNotGranted() throws IOException {
        Path root = Files.createDirectories(tmp.resolve("work"));
        Path outside = Files.createDirectories(tmp.resolve("elsewhere"));
        Path input = Files.writeString(root.resolve("in.docx"), "x");
        Path outsideInput = Files.writeString(outside.resolve("secret.docx"), "x");
        List<Path> roots = List.of(root);

        assertTrue(
                LibreOfficeSandboxPolicy.forCommand(
                                sofficeCommand(root.resolve("p"), root.resolve("o"), input), roots)
                        .isPresent());
        assertEquals(
                Optional.empty(),
                LibreOfficeSandboxPolicy.forCommand(
                        sofficeCommand(outside.resolve("p"), root.resolve("o"), input), roots));
        assertEquals(
                Optional.empty(),
                LibreOfficeSandboxPolicy.forCommand(
                        sofficeCommand(root.resolve("p"), root.resolve("../elsewhere/o"), input),
                        roots));
        assertEquals(
                Optional.empty(),
                LibreOfficeSandboxPolicy.forCommand(
                        sofficeCommand(root.resolve("p"), root.resolve("o"), outsideInput), roots));
    }

    @Test
    void seedsOnlyTheExtensionRegistryIntoFreshProfiles() throws IOException {
        Path template = tmp.resolve("template");
        Files.createDirectories(template.resolve("user/extensions/bundled"));
        Files.writeString(template.resolve("user/extensions/buildid"), "build-1");
        Files.createDirectories(template.resolve("user/basic/Standard"));
        Files.writeString(template.resolve("user/basic/Standard/Module1.xba"), "macro");
        Files.writeString(template.resolve("user/registrymodifications.xcu"), "<items/>");

        Path fresh = tmp.resolve("profile_b");
        LibreOfficeSandboxPolicy.seedProfile(fresh, template);

        assertEquals("build-1", Files.readString(fresh.resolve("user/extensions/buildid")));
        assertTrue(Files.isDirectory(fresh.resolve("user/extensions/bundled")));
        assertFalse(Files.exists(fresh.resolve("user/basic")), "macros are not templated");
        assertFalse(Files.exists(fresh.resolve("user/registrymodifications.xcu")));

        Path existing = tmp.resolve("profile_c");
        Files.createDirectories(existing.resolve("user"));
        LibreOfficeSandboxPolicy.seedProfile(existing, template);
        assertFalse(Files.exists(existing.resolve("user/extensions")));

        Path unseeded = tmp.resolve("profile_d");
        LibreOfficeSandboxPolicy.seedProfile(unseeded, tmp.resolve("missing-template"));
        LibreOfficeSandboxPolicy.seedProfile(unseeded, null);
        assertFalse(Files.exists(unseeded));
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
    @EnabledOnOs(OS.LINUX)
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
