package stirling.software.SPDF.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.FileOutputStream;
import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.SPDF.model.Dependency;

class NativeLicenseLoaderTest {

    private static URLClassLoader isolatedLoader(String... fixtureRoots) throws Exception {
        URL[] urls = new URL[fixtureRoots.length];
        for (int i = 0; i < fixtureRoots.length; i++) {
            urls[i] = Path.of("src/test/resources", fixtureRoots[i]).toUri().toURL();
        }
        return new URLClassLoader(urls, null);
    }

    private static String notice(String name, String licenseLine) {
        return "1. "
                + name
                + "\n   - Copyright (c) 2024 Test Contributors.\n   - License: "
                + licenseLine
                + "\n";
    }

    private static void writeJar(Path jar, Map<String, String> entries) throws Exception {
        try (JarOutputStream out = new JarOutputStream(new FileOutputStream(jar.toFile()))) {
            for (Map.Entry<String, String> entry : entries.entrySet()) {
                out.putNextEntry(new JarEntry(entry.getKey()));
                out.write(entry.getValue().getBytes(StandardCharsets.UTF_8));
                out.closeEntry();
            }
        }
    }

    private static List<Dependency> loadFromJars(Path... jars) throws Exception {
        URL[] urls = new URL[jars.length];
        for (int i = 0; i < jars.length; i++) {
            urls[i] = jars[i].toUri().toURL();
        }
        try (URLClassLoader both = new URLClassLoader(urls, null)) {
            return NativeLicenseLoader.loadNativeLicenses(both);
        }
    }

    @Test
    void parsesNoticeSectionsWithWrappedCopyrights() throws Exception {
        List<Dependency> dependencies;
        try (URLClassLoader loader = isolatedLoader("native-licenses")) {
            dependencies = NativeLicenseLoader.loadNativeLicenses(loader);
        }

        Map<String, Dependency> byName =
                dependencies.stream().collect(Collectors.toMap(Dependency::getModuleName, d -> d));
        assertEquals(5, byName.size());

        Dependency testComponent = byName.get("Test Component");
        assertNotNull(testComponent);
        assertEquals("BSD 3-Clause", testComponent.getModuleLicense());
        assertNull(testComponent.getModuleVersion(), "component versions are unknown");
        assertTrue(
                testComponent.getModuleLicenseText().startsWith("Copyright (c) 2016"),
                "copyright is prepended to the license text");
        assertTrue(
                testComponent
                        .getModuleLicenseText()
                        .contains("Redistribution and use in source and binary forms"));

        Dependency wrapped = byName.get("Wrapped Copyright Library");
        assertNotNull(wrapped);
        assertTrue(
                wrapped.getModuleLicenseText()
                        .contains(
                                "Copyright (c) 2015, OpenJPEG, entirely written by the OpenJPEG"
                                        + " authors"),
                "wrapped copyright continuations are joined");
    }

    @Test
    void parsesWrappedFileReferencesAndFilelessLicenses() throws Exception {
        List<Dependency> dependencies;
        try (URLClassLoader loader = isolatedLoader("native-licenses")) {
            dependencies = NativeLicenseLoader.loadNativeLicenses(loader);
        }

        Map<String, Dependency> byName =
                dependencies.stream().collect(Collectors.toMap(Dependency::getModuleName, d -> d));

        Dependency wrappedRef = byName.get("Wrapped File Reference Library");
        assertNotNull(wrappedRef, "a file reference wrapped onto the next line still resolves");
        assertEquals(
                "GNU Lesser General Public License v2.1 or later", wrappedRef.getModuleLicense());
        assertTrue(
                wrappedRef.getModuleLicenseText().contains("resolved through a"),
                "the wrapped sibling file is read");

        Dependency stack = byName.get("Multi License Stack");
        assertNotNull(stack, "a license naming no sibling file still produces a notice");
        assertTrue(
                stack.getModuleLicense().contains("Apache-2.0 OR MIT"),
                "compound expressions are preserved verbatim");
        assertNull(stack.getModuleLicenseText(), "no sibling file means no text");
    }

    @Test
    void discoversNoticesFromAnyJarUsingTheLayout() throws Exception {
        List<Dependency> dependencies;
        try (URLClassLoader loader = isolatedLoader("vips-sim")) {
            dependencies = NativeLicenseLoader.loadNativeLicenses(loader);
        }

        assertEquals(1, dependencies.size());
        assertEquals("Simulated Vips Native Codec", dependencies.get(0).getModuleName());
        assertEquals(
                "GNU Lesser General Public License v2.1 or later",
                dependencies.get(0).getModuleLicense());
        assertNull(dependencies.get(0).getModuleVersion());
        assertTrue(
                dependencies
                        .get(0)
                        .getModuleLicenseText()
                        .contains("Simulated vips native codec license text"));
    }

    @Test
    void identicalNoticesInTwoJarsCollapseToOneEntry(@TempDir Path tempDir) throws Exception {
        Map<String, String> jarContent =
                Map.of(
                        "licenses/NOTICE.txt",
                        notice("Dup Codec", "MIT License (see DUP-MIT.txt)"),
                        "licenses/DUP-MIT.txt",
                        "Duplicate codec license text.");
        Path first = tempDir.resolve("first.jar");
        Path second = tempDir.resolve("second.jar");
        writeJar(first, jarContent);
        writeJar(second, jarContent);

        List<Dependency> dependencies = loadFromJars(first, second);

        assertEquals(1, dependencies.size());
        assertEquals("Dup Codec", dependencies.get(0).getModuleName());
        assertTrue(
                dependencies.get(0).getModuleLicenseText().contains("Duplicate codec"),
                "sibling text resolves through jar URLs");
    }

    @Test
    void sameComponentWithDifferentLicensesIsPreserved(@TempDir Path tempDir) throws Exception {
        Path first = tempDir.resolve("first.jar");
        Path second = tempDir.resolve("second.jar");
        writeJar(
                first,
                Map.of(
                        "licenses/NOTICE.txt",
                        notice("Shared Codec", "MIT License (see SHARED-MIT.txt)"),
                        "licenses/SHARED-MIT.txt",
                        "MIT text."));
        writeJar(
                second,
                Map.of(
                        "licenses/NOTICE.txt",
                        notice("Shared Codec", "Apache License 2.0 (see SHARED-APACHE.txt)"),
                        "licenses/SHARED-APACHE.txt",
                        "Apache text."));

        List<Dependency> dependencies = loadFromJars(first, second);

        assertEquals(2, dependencies.size());
    }

    @Test
    void validTextSurvivesWhenTheFirstJarLacksIt(@TempDir Path tempDir) throws Exception {
        Path first = tempDir.resolve("first.jar");
        Path second = tempDir.resolve("second.jar");
        writeJar(
                first,
                Map.of(
                        "licenses/NOTICE.txt",
                        notice("Partial Codec", "BSD 3-Clause (see PARTIAL-BSD.txt)")));
        writeJar(
                second,
                Map.of(
                        "licenses/NOTICE.txt",
                        notice("Partial Codec", "BSD 3-Clause (see PARTIAL-BSD.txt)"),
                        "licenses/PARTIAL-BSD.txt",
                        "Partial codec license text."));

        List<Dependency> dependencies = loadFromJars(first, second);

        assertEquals(1, dependencies.size());
        assertTrue(
                dependencies.get(0).getModuleLicenseText().contains("Partial codec"),
                "the complete record wins over the textless one");
    }

    @Test
    void jarWithoutNoticeDoesNotBreakOtherJars(@TempDir Path tempDir) throws Exception {
        Path first = tempDir.resolve("first.jar");
        Path second = tempDir.resolve("second.jar");
        writeJar(first, Map.of("licenses/UNRELATED.txt", "no notice here"));
        writeJar(
                second,
                Map.of(
                        "licenses/NOTICE.txt",
                        notice("Lone Codec", "MIT License (see LONE-MIT.txt)"),
                        "licenses/LONE-MIT.txt",
                        "Lone codec license text."));

        List<Dependency> dependencies = loadFromJars(first, second);

        assertEquals(1, dependencies.size());
        assertEquals("Lone Codec", dependencies.get(0).getModuleName());
    }

    @Test
    void parsesWrappedTitlesAndMultiFileNotices() throws Exception {
        List<Dependency> dependencies;
        try (URLClassLoader loader = isolatedLoader("notice-edge")) {
            dependencies = NativeLicenseLoader.loadNativeLicenses(loader);
        }

        Map<String, Dependency> byName =
                dependencies.stream().collect(Collectors.toMap(Dependency::getModuleName, d -> d));
        assertEquals(2, byName.size());

        Dependency magick = byName.get("ImageMagick / MagickCore");
        assertNotNull(magick, "a title wrapped onto the next line is joined");
        assertEquals("ImageMagick License", magick.getModuleLicense());
        assertTrue(magick.getModuleLicenseText().contains("ImageMagick license text."));

        Dependency dual = byName.get("Dual Text Codec");
        assertNotNull(dual);
        String text = dual.getModuleLicenseText();
        assertNotNull(text);
        assertTrue(text.contains("--- DUAL-BSD.txt ---"), "each file keeps a heading");
        assertTrue(text.contains("Dual BSD text."));
        assertTrue(text.contains("--- DUAL-PATENT.txt ---"));
        assertTrue(text.contains("Dual patent text."));
        assertEquals("BSD 3-Clause plus patent grant", dual.getModuleLicense());
    }

    @Test
    void parsesLetteredSubsectionsAndBareSeeBullets(@TempDir Path tempDir) throws Exception {
        Path licensesDir = Files.createDirectories(tempDir.resolve("licenses"));
        Files.writeString(
                licensesDir.resolve("NOTICE.txt"),
                "1. Parent\n"
                        + "   - License: BSD 3-Clause (see PARENT.txt)\n"
                        + "2a. Abseil\n"
                        + "   - Copyright (c) 2017 The Abseil Authors\n"
                        + "   - License: Apache License 2.0 (see ABSEIL.txt)\n"
                        + "2b. JPDFium compact CMYK profile\n"
                        + "   - See PROFILE.NOTICE.txt\n"
                        + "6a. Lerc\n"
                        + "   - License: Apache License 2.0 (see LERC.txt)\n");
        Files.writeString(licensesDir.resolve("PARENT.txt"), "Parent text.");
        Files.writeString(licensesDir.resolve("ABSEIL.txt"), "Abseil text.");
        Files.writeString(licensesDir.resolve("PROFILE.NOTICE.txt"), "Profile notice text.");
        Files.writeString(licensesDir.resolve("LERC.txt"), "Lerc text.");

        List<Dependency> dependencies;
        try (URLClassLoader loader =
                new URLClassLoader(new URL[] {tempDir.toUri().toURL()}, null)) {
            dependencies = NativeLicenseLoader.loadNativeLicenses(loader);
        }

        Map<String, Dependency> byName =
                dependencies.stream().collect(Collectors.toMap(Dependency::getModuleName, d -> d));
        assertEquals(4, byName.size());

        Dependency abseil = byName.get("Abseil");
        assertNotNull(abseil, "lettered subsections are components too");
        assertEquals("Apache License 2.0", abseil.getModuleLicense());
        assertTrue(abseil.getModuleLicenseText().contains("Abseil text."));

        Dependency profile = byName.get("JPDFium compact CMYK profile");
        assertNotNull(profile, "a section that only names a bundled notice still appears");
        assertEquals("Bundled notice", profile.getModuleLicense());
        assertTrue(profile.getModuleLicenseText().contains("Profile notice text."));

        assertTrue(byName.get("Lerc").getModuleLicenseText().contains("Lerc text."));
    }

    @Test
    void resolvesInlineTextReferencesAndKeepsAttributionBullets(@TempDir Path tempDir)
            throws Exception {
        Path licensesDir = Files.createDirectories(tempDir.resolve("licenses"));
        Files.writeString(
                licensesDir.resolve("NOTICE.txt"),
                "1. SVG rasterization\n"
                        + "   - License: Apache-2.0 OR MIT (resvg/...), BSD-3-Clause"
                        + " (tiny-skia).\n"
                        + "     The Apache-2.0 text is in HIGHWAY.txt, MIT in HARFBUZZ.txt.\n"
                        + "2. jpeg-encoder\n"
                        + "   - License: (MIT OR Apache-2.0) AND IJG (Apache-2.0 text in\n"
                        + "     HIGHWAY.txt, MIT in HARFBUZZ.txt, IJG in IJG.txt)\n"
                        + "   - This software is based in part on the work of the\n"
                        + "     Independent JPEG Group.\n");
        Files.writeString(licensesDir.resolve("HIGHWAY.txt"), "Highway text.");
        Files.writeString(licensesDir.resolve("HARFBUZZ.txt"), "HarfBuzz text.");
        Files.writeString(licensesDir.resolve("IJG.txt"), "IJG text.");

        List<Dependency> dependencies;
        try (URLClassLoader loader =
                new URLClassLoader(new URL[] {tempDir.toUri().toURL()}, null)) {
            dependencies = NativeLicenseLoader.loadNativeLicenses(loader);
        }

        Map<String, Dependency> byName =
                dependencies.stream().collect(Collectors.toMap(Dependency::getModuleName, d -> d));
        Dependency resvg = byName.get("SVG rasterization");
        assertNotNull(resvg);
        assertEquals(
                "Apache-2.0 OR MIT (resvg/...), BSD-3-Clause (tiny-skia).",
                resvg.getModuleLicense());
        assertTrue(resvg.getModuleLicenseText().contains("Highway text."));
        assertTrue(resvg.getModuleLicenseText().contains("HarfBuzz text."));

        Dependency jpeg = byName.get("jpeg-encoder");
        assertNotNull(jpeg);
        assertEquals("(MIT OR Apache-2.0) AND IJG", jpeg.getModuleLicense());
        assertTrue(jpeg.getModuleLicenseText().contains("IJG text."));
        assertTrue(
                jpeg.getModuleNoticeText().contains("Independent JPEG Group"),
                "the IJG attribution sentence survives as supporting notice text");
    }

    @Test
    void keepsFilelessAttributionAndStripsInlineReferences(@TempDir Path tempDir) throws Exception {
        Path licensesDir = Files.createDirectories(tempDir.resolve("licenses"));
        Files.writeString(
                licensesDir.resolve("NOTICE.txt"),
                "1. Fileless Attribution\n"
                        + "   - Copyright (c) 2026 Attribution Authors\n"
                        + "   - License: BSD-2-Clause\n"
                        + "   - The JIT compiler bundles SLJIT, Copyright Zoltan Herczeg.\n"
                        + "2. Inline Only\n"
                        + "   - License: Apache-2.0 text is in INLINE.txt\n"
                        + "3. Bare See\n"
                        + "   - License: MIT License. See BARE.txt\n");
        Files.writeString(licensesDir.resolve("INLINE.txt"), "Inline text.");
        Files.writeString(licensesDir.resolve("BARE.txt"), "Bare text.");

        List<Dependency> dependencies;
        try (URLClassLoader loader =
                new URLClassLoader(new URL[] {tempDir.toUri().toURL()}, null)) {
            dependencies = NativeLicenseLoader.loadNativeLicenses(loader);
        }

        Map<String, Dependency> byName =
                dependencies.stream().collect(Collectors.toMap(Dependency::getModuleName, d -> d));

        Dependency fileless = byName.get("Fileless Attribution");
        assertNotNull(fileless);
        assertEquals("BSD-2-Clause", fileless.getModuleLicense());
        assertNull(
                fileless.getModuleLicenseText(),
                "attribution notes are not presented as the full license text");
        assertTrue(fileless.getModuleNoticeText().contains("SLJIT"));

        assertEquals("Apache-2.0", byName.get("Inline Only").getModuleLicense());
        assertEquals("MIT License.", byName.get("Bare See").getModuleLicense());
        assertTrue(byName.get("Bare See").getModuleLicenseText().contains("Bare text."));
    }

    @Test
    void treatsAnySiblingTxtMentionAsAFileReference(@TempDir Path tempDir) throws Exception {
        Path licensesDir = Files.createDirectories(tempDir.resolve("licenses"));
        Files.writeString(
                licensesDir.resolve("NOTICE.txt"),
                "1. Future Phrasing\n"
                        + "   - License: MIT (bundled as FUTURE-A.txt; attribution in"
                        + " FUTURE-B.txt)\n"
                        + "2. Star Bullets\n"
                        + "   * Copyright (c) 2026 Star\n"
                        + "   * License: BSD 3-Clause (see STAR.txt)\n"
                        + "   * Additional attribution lives in STAR-NOTICE.txt\n");
        Files.writeString(licensesDir.resolve("FUTURE-A.txt"), "Future A text.");
        Files.writeString(licensesDir.resolve("FUTURE-B.txt"), "Future B text.");
        Files.writeString(licensesDir.resolve("STAR.txt"), "Star text.");
        Files.writeString(licensesDir.resolve("STAR-NOTICE.txt"), "Star notice text.");

        List<Dependency> dependencies;
        try (URLClassLoader loader =
                new URLClassLoader(new URL[] {tempDir.toUri().toURL()}, null)) {
            dependencies = NativeLicenseLoader.loadNativeLicenses(loader);
        }

        Map<String, Dependency> byName =
                dependencies.stream().collect(Collectors.toMap(Dependency::getModuleName, d -> d));
        Dependency future = byName.get("Future Phrasing");
        assertNotNull(future);
        assertEquals("MIT", future.getModuleLicense());
        assertTrue(future.getModuleLicenseText().contains("Future A text."));
        assertTrue(future.getModuleLicenseText().contains("Future B text."));

        Dependency star = byName.get("Star Bullets");
        assertNotNull(star, "bullets other than '-' are still metadata");
        assertEquals("BSD 3-Clause", star.getModuleLicense());
        assertTrue(star.getModuleLicenseText().contains("Star text."));
        assertTrue(star.getModuleLicenseText().contains("Star notice text."));
    }

    @Test
    void listsLicenseFilesTheNoticeDoesNotReference(@TempDir Path tempDir) throws Exception {
        Path jar = tempDir.resolve("natives.jar");
        writeJar(
                jar,
                Map.of(
                        "licenses/NOTICE.txt",
                        notice("Referenced Codec", "MIT License (see REFERENCED-MIT.txt)"),
                        "licenses/REFERENCED-MIT.txt",
                        "Referenced text.",
                        "licenses/AOM-BSD-2.txt",
                        "AOM text.",
                        "licenses/DAV1D-ISC.txt",
                        "dav1d text.",
                        "licenses/UTIL-LINUX-LGPL-2.1.txt",
                        "util-linux text.",
                        "licenses/README.md",
                        "not a license"));

        Map<String, Dependency> byName =
                loadFromJars(jar).stream()
                        .collect(Collectors.toMap(Dependency::getModuleName, d -> d));

        assertEquals(4, byName.size(), "referenced file is not repeated as an orphan");
        assertEquals("BSD-2-Clause", byName.get("AOM").getModuleLicense());
        assertEquals("ISC", byName.get("DAV1D").getModuleLicense());
        assertEquals("LGPL-2.1", byName.get("UTIL-LINUX").getModuleLicense());
        assertTrue(
                byName.get("Referenced Codec").getModuleLicenseText().contains("Referenced text."));
    }

    @Test
    void noNoticeOnTheClasspathReturnsEmptyList() throws Exception {
        List<Dependency> dependencies;
        try (URLClassLoader loader = new URLClassLoader(new URL[0], null)) {
            dependencies = NativeLicenseLoader.loadNativeLicenses(loader);
        }

        assertTrue(dependencies.isEmpty());
    }

    @Test
    void malformedNoticeReturnsEmptyList() throws Exception {
        List<Dependency> dependencies;
        try (URLClassLoader loader = isolatedLoader("malformed")) {
            dependencies = NativeLicenseLoader.loadNativeLicenses(loader);
        }

        assertTrue(dependencies.isEmpty());
    }

    @Test
    void hostileFileReferencesAreNeverRead(@TempDir Path tempDir) throws Exception {
        Path licensesDir = Files.createDirectories(tempDir.resolve("licenses"));
        Files.writeString(
                licensesDir.resolve("NOTICE.txt"),
                "1. Crafty Codec\n"
                        + "   - Copyright (c) 2024 Someone\n"
                        + "   - License: BSD 3-Clause (see ../evil.txt)\n"
                        + "2. Craftier Codec\n"
                        + "   - Copyright (c) 2024 Someone Else\n"
                        + "   - License: MIT License (see file:/etc/passwd)\n");
        Files.writeString(tempDir.resolve("evil.txt"), "you should never read this");
        List<Dependency> dependencies;
        try (URLClassLoader loader =
                new URLClassLoader(new URL[] {tempDir.toUri().toURL()}, null)) {
            dependencies = NativeLicenseLoader.loadNativeLicenses(loader);
        }

        assertEquals(2, dependencies.size());
        for (Dependency dependency : dependencies) {
            assertNull(
                    dependency.getModuleLicenseText(),
                    "traversal and scheme references must not be resolved");
        }
    }

    @Test
    void rejectsSymlinkedLicenseFiles(@TempDir Path tempDir) throws Exception {
        Path licensesDir = Files.createDirectories(tempDir.resolve("licenses"));
        Files.writeString(
                licensesDir.resolve("NOTICE.txt"),
                "1. Link Codec\n   - License: MIT License (see REF-LINK.txt)\n");
        Path secret = tempDir.resolve("secret.txt");
        Files.writeString(secret, "secret text");
        try {
            Files.createSymbolicLink(licensesDir.resolve("REF-LINK.txt"), secret);
            Files.createSymbolicLink(licensesDir.resolve("ORPHAN-LINK.txt"), secret);
        } catch (UnsupportedOperationException | IOException e) {
            Assumptions.assumeTrue(false, "symlinks unavailable: " + e);
        }
        Files.writeString(licensesDir.resolve("REAL.txt"), "Real text.");

        List<Dependency> dependencies;
        try (URLClassLoader loader =
                new URLClassLoader(new URL[] {tempDir.toUri().toURL()}, null)) {
            dependencies = NativeLicenseLoader.loadNativeLicenses(loader);
        }

        Map<String, Dependency> byName =
                dependencies.stream().collect(Collectors.toMap(Dependency::getModuleName, d -> d));
        Dependency link = byName.get("Link Codec");
        assertNotNull(link);
        assertNull(link.getModuleLicenseText(), "a referenced symlink is not read");
        assertTrue(byName.containsKey("REAL"), "a regular orphan is still listed");
        for (Dependency dependency : dependencies) {
            assertFalse(
                    Objects.toString(dependency.getModuleLicenseText(), "")
                            .contains("secret text"));
            assertFalse(
                    Objects.toString(dependency.getModuleNoticeText(), "").contains("secret text"));
        }
    }

    @Test
    void missingSiblingLicenseTextLeavesTextUnset(@TempDir Path tempDir) throws Exception {
        Path licensesDir = Files.createDirectories(tempDir.resolve("licenses"));
        Files.writeString(
                licensesDir.resolve("NOTICE.txt"),
                "1. Component Without Text\n"
                        + "   - Copyright (c) 2024 Someone\n"
                        + "   - License: BSD 3-Clause (see MISSING-FILE.txt)\n");
        List<Dependency> dependencies;
        try (URLClassLoader loader =
                new URLClassLoader(new URL[] {tempDir.toUri().toURL()}, null)) {
            dependencies = NativeLicenseLoader.loadNativeLicenses(loader);
        }

        assertEquals(1, dependencies.size());
        assertNull(
                dependencies.get(0).getModuleLicenseText(),
                "copyright alone must not stand in for the license text");
    }
}
