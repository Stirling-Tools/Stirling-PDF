package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.config.EndpointConfiguration.DisableReason;
import stirling.software.SPDF.config.EndpointConfiguration.EndpointAvailability;
import stirling.software.common.model.ApplicationProperties;

/**
 * Unit tests for {@link EndpointConfiguration}. The class wires up its endpoint/group registry in
 * {@code init()} during construction and then applies environment overrides. We build it with a
 * real {@link ApplicationProperties} (whose System/Endpoints sub-objects are non-null by default)
 * so the constructor runs cleanly without any mocking.
 */
class EndpointConfigurationGapTest {

    private ApplicationProperties applicationProperties;

    /**
     * Construct an EndpointConfiguration with the given pro flag and current applicationProperties.
     */
    private EndpointConfiguration build(boolean runningProOrHigher) {
        return new EndpointConfiguration(applicationProperties, runningProOrHigher);
    }

    /** Default config: not pro, no removals, url-to-pdf disabled (default System flag is false). */
    private EndpointConfiguration buildDefault() {
        return build(false);
    }

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
    }

    @Nested
    @DisplayName("endpointKeyForUri (static)")
    class EndpointKeyForUriTests {

        @Test
        @DisplayName("returns null for null uri")
        void nullUri() {
            assertNull(EndpointConfiguration.endpointKeyForUri(null));
        }

        @Test
        @DisplayName("returns null when uri does not contain /api/v1")
        void notApiPath() {
            assertNull(EndpointConfiguration.endpointKeyForUri("/foo/bar/baz"));
            assertNull(EndpointConfiguration.endpointKeyForUri("https://example.com/home"));
        }

        @Test
        @DisplayName("returns null when uri has too few path segments")
        void tooFewSegments() {
            // "/api/v1/general" splits to ["", "api", "v1", "general"] -> length 4, not > 4
            assertNull(EndpointConfiguration.endpointKeyForUri("/api/v1/general"));
        }

        @Test
        @DisplayName("extracts plain endpoint key from a standard /api/v1/<group>/<endpoint> uri")
        void plainEndpoint() {
            assertEquals(
                    "remove-pages",
                    EndpointConfiguration.endpointKeyForUri("/api/v1/general/remove-pages"));
        }

        @Test
        @DisplayName("builds a <from>-to-<to> key for convert endpoints")
        void convertEndpoint() {
            assertEquals(
                    "pdf-to-img",
                    EndpointConfiguration.endpointKeyForUri("/api/v1/convert/pdf/img"));
        }

        @Test
        @DisplayName("convert path without a target segment falls back to the segment after group")
        void convertWithoutTarget() {
            // "/api/v1/convert/pdf" -> length 5, the convert branch needs length > 5
            assertEquals("pdf", EndpointConfiguration.endpointKeyForUri("/api/v1/convert/pdf"));
        }
    }

    @Nested
    @DisplayName("enable / disable endpoint")
    class EnableDisableEndpointTests {

        @Test
        @DisplayName("a freshly registered endpoint is enabled by default")
        void enabledByDefault() {
            EndpointConfiguration config = buildDefault();
            assertTrue(config.isEndpointEnabled("merge-pdfs"));
        }

        @Test
        @DisplayName("disableEndpoint marks the endpoint disabled")
        void disableEndpoint() {
            EndpointConfiguration config = buildDefault();
            config.disableEndpoint("merge-pdfs");
            assertFalse(config.isEndpointEnabled("merge-pdfs"));
        }

        @Test
        @DisplayName("enableEndpoint re-enables a previously disabled endpoint")
        void reEnableEndpoint() {
            EndpointConfiguration config = buildDefault();
            config.disableEndpoint("merge-pdfs");
            assertFalse(config.isEndpointEnabled("merge-pdfs"));
            config.enableEndpoint("merge-pdfs");
            assertTrue(config.isEndpointEnabled("merge-pdfs"));
        }

        @Test
        @DisplayName("leading slash is normalized away on disable")
        void leadingSlashNormalizedOnDisable() {
            EndpointConfiguration config = buildDefault();
            config.disableEndpoint("/merge-pdfs");
            // both forms resolve to the same key
            assertFalse(config.isEndpointEnabled("merge-pdfs"));
            assertFalse(config.isEndpointEnabled("/merge-pdfs"));
        }

        @Test
        @DisplayName("isEndpointEnabled tolerates a leading slash on the query")
        void leadingSlashOnQuery() {
            EndpointConfiguration config = buildDefault();
            assertTrue(config.isEndpointEnabled("/merge-pdfs"));
        }

        @Test
        @DisplayName("disabling clears with enable, removing the disable reason")
        void enableClearsReason() {
            EndpointConfiguration config = buildDefault();
            config.disableEndpoint("split-pages", DisableReason.DEPENDENCY);
            assertEquals(
                    DisableReason.DEPENDENCY,
                    config.getEndpointAvailability("split-pages").getReason());
            config.enableEndpoint("split-pages");
            EndpointAvailability availability = config.getEndpointAvailability("split-pages");
            assertTrue(availability.isEnabled());
            assertNull(availability.getReason());
        }
    }

    @Nested
    @DisplayName("isEndpointEnabledForUri")
    class IsEndpointEnabledForUriTests {

        @Test
        @DisplayName("translates a /api/v1 uri to a key and reports its status")
        void translatesUri() {
            EndpointConfiguration config = buildDefault();
            assertTrue(config.isEndpointEnabledForUri("/api/v1/general/merge-pdfs"));
            config.disableEndpoint("merge-pdfs");
            assertFalse(config.isEndpointEnabledForUri("/api/v1/general/merge-pdfs"));
        }

        @Test
        @DisplayName("falls back to treating a non-api uri as a raw key")
        void fallsBackToRawKey() {
            EndpointConfiguration config = buildDefault();
            config.disableEndpoint("merge-pdfs");
            // non-api path: key resolution returns null, so the uri itself is used as the key
            assertFalse(config.isEndpointEnabledForUri("merge-pdfs"));
        }
    }

    @Nested
    @DisplayName("group enable / disable")
    class GroupTests {

        @Test
        @DisplayName("a functional group with all endpoints enabled reports enabled")
        void functionalGroupEnabled() {
            EndpointConfiguration config = buildDefault();
            assertTrue(config.isGroupEnabled("PageOps"));
        }

        @Test
        @DisplayName("disabling a functional group cascades to all its endpoints")
        void disableFunctionalGroupCascades() {
            EndpointConfiguration config = buildDefault();
            config.disableGroup("PageOps");
            assertFalse(config.isGroupEnabled("PageOps"));
            assertFalse(config.isEndpointEnabled("remove-pages"));
            assertFalse(config.isEndpointEnabled("split-pages"));
        }

        @Test
        @DisplayName("re-enabling a functional group re-enables its endpoints")
        void enableFunctionalGroupRestores() {
            EndpointConfiguration config = buildDefault();
            config.disableGroup("PageOps");
            assertFalse(config.isEndpointEnabled("remove-pages"));
            config.enableGroup("PageOps");
            assertTrue(config.isEndpointEnabled("remove-pages"));
            assertTrue(config.isGroupEnabled("PageOps"));
        }

        @Test
        @DisplayName("a functional group with one disabled endpoint is not enabled")
        void functionalGroupWithDisabledEndpoint() {
            EndpointConfiguration config = buildDefault();
            config.disableEndpoint("remove-pages");
            assertFalse(config.isGroupEnabled("PageOps"));
        }

        @Test
        @DisplayName("disabledGroups reflects disabled groups and getDisabledGroups returns a copy")
        void getDisabledGroupsReturnsCopy() {
            EndpointConfiguration config = buildDefault();
            config.disableGroup("PageOps");
            Set<String> disabled = config.getDisabledGroups();
            assertTrue(disabled.contains("PageOps"));
            // mutating the returned set must not affect internal state
            disabled.clear();
            assertTrue(config.getDisabledGroups().contains("PageOps"));
        }

        @Test
        @DisplayName("an unknown group with no endpoints is not enabled")
        void unknownGroupNotEnabled() {
            EndpointConfiguration config = buildDefault();
            assertFalse(config.isGroupEnabled("NoSuchGroupXyz"));
        }
    }

    @Nested
    @DisplayName("tool group semantics")
    class ToolGroupTests {

        @Test
        @DisplayName("a tool group is enabled until explicitly disabled")
        void toolGroupEnabledUntilDisabled() {
            EndpointConfiguration config = buildDefault();
            assertTrue(config.isGroupEnabled("qpdf"));
            config.disableGroup("qpdf");
            assertFalse(config.isGroupEnabled("qpdf"));
        }

        @Test
        @DisplayName("disabling a tool group does NOT cascade to its endpoints directly")
        void toolGroupNoCascade() {
            EndpointConfiguration config = buildDefault();
            // repair has alternatives (qpdf, Ghostscript); disabling only qpdf keeps it enabled
            config.disableGroup("qpdf");
            assertTrue(config.isEndpointEnabled("repair"));
        }

        @Test
        @DisplayName("endpoint with alternatives is disabled only when all tool groups are gone")
        void allAlternativesDisabled() {
            EndpointConfiguration config = buildDefault();
            config.disableGroup("qpdf");
            config.disableGroup("Ghostscript");
            // repair's only alternatives are qpdf and Ghostscript
            assertFalse(config.isEndpointEnabled("repair"));
        }

        @Test
        @DisplayName("endpoint with a still-enabled alternative stays enabled")
        void oneAlternativeRemains() {
            EndpointConfiguration config = buildDefault();
            // compress-pdf alternatives: qpdf, Ghostscript, Java
            config.disableGroup("qpdf");
            config.disableGroup("Ghostscript");
            assertTrue(config.isEndpointEnabled("compress-pdf"));
            config.disableGroup("Java");
            assertFalse(config.isEndpointEnabled("compress-pdf"));
        }

        @Test
        @DisplayName("single-dependency endpoint (no alternatives) disabled when its tool group is")
        void singleDependencyDisabled() {
            EndpointConfiguration config = buildDefault();
            // pdf-to-epub depends on Calibre, no alternatives registered
            assertTrue(config.isEndpointEnabled("pdf-to-epub"));
            config.disableGroup("Calibre");
            assertFalse(config.isEndpointEnabled("pdf-to-epub"));
        }
    }

    @Nested
    @DisplayName("addEndpointToGroup / addEndpointAlternative")
    class RegistrationTests {

        @Test
        @DisplayName("addEndpointToGroup makes the endpoint part of the group")
        void addEndpointToGroup() {
            EndpointConfiguration config = buildDefault();
            config.addEndpointToGroup("CustomGroup", "custom-endpoint");
            Set<String> endpoints = config.getEndpointsForGroup("CustomGroup");
            assertTrue(endpoints.contains("custom-endpoint"));
        }

        @Test
        @DisplayName("disabling a custom functional group disables its added endpoint")
        void customFunctionalGroupCascades() {
            EndpointConfiguration config = buildDefault();
            config.addEndpointToGroup("CustomGroup", "custom-endpoint");
            assertTrue(config.isEndpointEnabled("custom-endpoint"));
            config.disableGroup("CustomGroup");
            assertFalse(config.isEndpointEnabled("custom-endpoint"));
        }

        @Test
        @DisplayName("getEndpointsForGroup returns an empty set for unknown groups")
        void unknownGroupEmptySet() {
            EndpointConfiguration config = buildDefault();
            Set<String> endpoints = config.getEndpointsForGroup("NoSuchGroupXyz");
            assertNotNull(endpoints);
            assertTrue(endpoints.isEmpty());
        }
    }

    @Nested
    @DisplayName("getEndpointAvailability / determineDisableReason")
    class AvailabilityTests {

        @Test
        @DisplayName("an enabled endpoint has a null disable reason")
        void enabledHasNullReason() {
            EndpointConfiguration config = buildDefault();
            EndpointAvailability availability = config.getEndpointAvailability("merge-pdfs");
            assertTrue(availability.isEnabled());
            assertNull(availability.getReason());
        }

        @Test
        @DisplayName("explicit disable preserves the supplied reason")
        void explicitDisableReason() {
            EndpointConfiguration config = buildDefault();
            config.disableEndpoint("merge-pdfs", DisableReason.DEPENDENCY);
            EndpointAvailability availability = config.getEndpointAvailability("merge-pdfs");
            assertFalse(availability.isEnabled());
            assertEquals(DisableReason.DEPENDENCY, availability.getReason());
        }

        @Test
        @DisplayName("default disableEndpoint reason is CONFIG")
        void defaultDisableReasonIsConfig() {
            EndpointConfiguration config = buildDefault();
            config.disableEndpoint("merge-pdfs");
            assertEquals(
                    DisableReason.CONFIG, config.getEndpointAvailability("merge-pdfs").getReason());
        }

        @Test
        @DisplayName("endpoint disabled via functional group reports the group's reason")
        void functionalGroupReason() {
            EndpointConfiguration config = buildDefault();
            config.disableGroup("PageOps", DisableReason.DEPENDENCY);
            EndpointAvailability availability = config.getEndpointAvailability("crop");
            assertFalse(availability.isEnabled());
            // crop is disabled both via group cascade and group membership; reason is DEPENDENCY
            assertEquals(DisableReason.DEPENDENCY, availability.getReason());
        }
    }

    @Nested
    @DisplayName("getAllEndpoints")
    class GetAllEndpointsTests {

        @Test
        @DisplayName("aggregates endpoints across all groups")
        void aggregatesAcrossGroups() {
            EndpointConfiguration config = buildDefault();
            Set<String> all = config.getAllEndpoints();
            assertTrue(all.contains("merge-pdfs"));
            assertTrue(all.contains("compress-pdf"));
            assertTrue(all.contains("ocr-pdf"));
            assertFalse(all.isEmpty());
        }

        @Test
        @DisplayName("custom endpoints registered after init appear in getAllEndpoints")
        void includesCustomEndpoints() {
            EndpointConfiguration config = buildDefault();
            config.addEndpointToGroup("CustomGroup", "brand-new-endpoint");
            assertTrue(config.getAllEndpoints().contains("brand-new-endpoint"));
        }
    }

    @Nested
    @DisplayName("environment / constructor driven configuration")
    class EnvironmentConfigTests {

        @Test
        @DisplayName("url-to-pdf is disabled when enableUrlToPDF is false (default)")
        void urlToPdfDisabledByDefault() {
            EndpointConfiguration config = buildDefault();
            assertFalse(config.isEndpointEnabled("url-to-pdf"));
        }

        @Test
        @DisplayName("url-to-pdf stays enabled when enableUrlToPDF is true")
        void urlToPdfEnabledWhenFlagSet() {
            applicationProperties.getSystem().setEnableUrlToPDF(true);
            EndpointConfiguration config = build(false);
            assertTrue(config.isEndpointEnabled("url-to-pdf"));
        }

        @Test
        @DisplayName("endpoints.toRemove disables the listed endpoints at construction")
        void endpointsToRemove() {
            applicationProperties
                    .getEndpoints()
                    .setToRemove(List.of(" merge-pdfs ", "split-pages"));
            EndpointConfiguration config = build(false);
            // values are trimmed before disabling
            assertFalse(config.isEndpointEnabled("merge-pdfs"));
            assertFalse(config.isEndpointEnabled("split-pages"));
        }

        @Test
        @DisplayName("endpoints.groupsToRemove disables the listed groups at construction")
        void groupsToRemove() {
            applicationProperties.getEndpoints().setGroupsToRemove(List.of(" PageOps "));
            EndpointConfiguration config = build(false);
            assertTrue(config.getDisabledGroups().contains("PageOps"));
            assertFalse(config.isEndpointEnabled("remove-pages"));
        }

        @Test
        @DisplayName("non-pro build disables the enterprise group")
        void nonProDisablesEnterprise() {
            EndpointConfiguration config = build(false);
            assertTrue(config.getDisabledGroups().contains("enterprise"));
        }

        @Test
        @DisplayName("pro build does not disable the enterprise group")
        void proDoesNotDisableEnterprise() {
            EndpointConfiguration config = build(true);
            assertFalse(config.getDisabledGroups().contains("enterprise"));
        }
    }

    @Nested
    @DisplayName("getEndpointStatuses (Lombok getter) and logging summary")
    class MiscTests {

        @Test
        @DisplayName("getEndpointStatuses reflects explicit disable state")
        void endpointStatusesReflectDisable() {
            EndpointConfiguration config = buildDefault();
            config.disableEndpoint("merge-pdfs");
            assertEquals(Boolean.FALSE, config.getEndpointStatuses().get("merge-pdfs"));
        }

        @Test
        @DisplayName("logDisabledEndpointsSummary runs without throwing")
        void logSummaryDoesNotThrow() {
            EndpointConfiguration config = buildDefault();
            config.disableGroup("PageOps");
            config.disableGroup("qpdf");
            // purely a smoke test of the logging branch coverage
            config.logDisabledEndpointsSummary();
        }

        @Test
        @DisplayName("logDisabledEndpointsSummary runs when nothing is disabled")
        void logSummaryNothingDisabled() {
            applicationProperties.getSystem().setEnableUrlToPDF(true);
            EndpointConfiguration config = build(true);
            config.logDisabledEndpointsSummary();
        }
    }
}
