package stirling.software.SPDF.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.FileOutputStream;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import java.util.stream.Collectors;

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
        List<Dependency> dependencies =
                NativeLicenseLoader.loadNativeLicenses(isolatedLoader("native-licenses"));

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
        List<Dependency> dependencies =
                NativeLicenseLoader.loadNativeLicenses(isolatedLoader("native-licenses"));

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
        List<Dependency> dependencies =
                NativeLicenseLoader.loadNativeLicenses(isolatedLoader("vips-sim"));

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
    void noNoticeOnTheClasspathReturnsEmptyList() throws Exception {
        List<Dependency> dependencies =
                NativeLicenseLoader.loadNativeLicenses(new URLClassLoader(new URL[0], null));

        assertTrue(dependencies.isEmpty());
    }

    @Test
    void malformedNoticeReturnsEmptyList() throws Exception {
        List<Dependency> dependencies =
                NativeLicenseLoader.loadNativeLicenses(isolatedLoader("malformed"));

        assertTrue(dependencies.isEmpty());
    }

    @Test
    void missingSiblingLicenseTextLeavesTextUnset(@TempDir Path tempDir) throws Exception {
        Path licensesDir = Files.createDirectories(tempDir.resolve("licenses"));
        Files.writeString(
                licensesDir.resolve("NOTICE.txt"),
                "1. Component Without Text\n"
                        + "   - Copyright (c) 2024 Someone\n"
                        + "   - License: BSD 3-Clause (see MISSING-FILE.txt)\n");
        URLClassLoader loader = new URLClassLoader(new URL[] {tempDir.toUri().toURL()}, null);

        List<Dependency> dependencies = NativeLicenseLoader.loadNativeLicenses(loader);

        assertEquals(1, dependencies.size());
        assertNull(
                dependencies.get(0).getModuleLicenseText(),
                "copyright alone must not stand in for the license text");
    }
}
