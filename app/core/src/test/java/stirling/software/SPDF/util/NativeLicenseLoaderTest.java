package stirling.software.SPDF.util;

import static org.junit.jupiter.api.Assertions.*;

import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.Dependency;

class NativeLicenseLoaderTest {

    private static URLClassLoader isolatedLoader(String... fixtureRoots) throws Exception {
        URL[] urls = new URL[fixtureRoots.length];
        for (int i = 0; i < fixtureRoots.length; i++) {
            urls[i] = Path.of("src/test/resources", fixtureRoots[i]).toUri().toURL();
        }
        return new URLClassLoader(urls, null);
    }

    @Test
    void parsesNoticeSectionsWithWrappedCopyrights() throws Exception {
        List<Dependency> dependencies =
                NativeLicenseLoader.loadNativeLicenses(isolatedLoader("native-licenses"), "9.9.9");

        Map<String, Dependency> byName =
                dependencies.stream().collect(Collectors.toMap(Dependency::getModuleName, d -> d));
        assertEquals(3, byName.size());

        Dependency testComponent = byName.get("Test Component");
        assertNotNull(testComponent);
        assertEquals("BSD 3-Clause", testComponent.getModuleLicense());
        assertEquals("9.9.9", testComponent.getModuleVersion());
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
    void discoversNoticesFromAnyJarUsingTheLayout() throws Exception {
        List<Dependency> dependencies =
                NativeLicenseLoader.loadNativeLicenses(isolatedLoader("vips-sim"), "9.9.9");

        assertEquals(1, dependencies.size());
        assertEquals("Simulated Vips Native Codec", dependencies.get(0).getModuleName());
        assertEquals("LGPL 2.1", dependencies.get(0).getModuleLicense());
        assertTrue(
                dependencies
                        .get(0)
                        .getModuleLicenseText()
                        .contains("Simulated vips native codec license text"));
    }

    @Test
    void duplicateNoticesAcrossJarsCollapseToOneEntry() throws Exception {
        List<Dependency> dependencies =
                NativeLicenseLoader.loadNativeLicenses(
                        isolatedLoader("native-licenses", "native-licenses"), "9.9.9");

        assertEquals(3, dependencies.size());
    }

    @Test
    void noNoticeOnTheClasspathReturnsEmptyList() throws Exception {
        List<Dependency> dependencies =
                NativeLicenseLoader.loadNativeLicenses(
                        new URLClassLoader(new URL[0], null), "9.9.9");

        assertTrue(dependencies.isEmpty());
    }

    @Test
    void malformedNoticeReturnsEmptyList() throws Exception {
        List<Dependency> dependencies =
                NativeLicenseLoader.loadNativeLicenses(isolatedLoader("malformed"), "9.9.9");

        assertTrue(dependencies.isEmpty());
    }
}
