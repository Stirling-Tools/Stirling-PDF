package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

class EndpointConfigurationTest {

    @Test
    void conversionsStayEnabledWithoutExternalConverters() {
        ApplicationProperties properties = new ApplicationProperties();
        EndpointConfiguration endpoints = new EndpointConfiguration(properties, false, null, null);
        List<String> standardConverters =
                List.of("LibreOffice", "Unoconvert", "Weasyprint", "Pdftohtml", "Calibre");
        List<String> conversions =
                List.of(
                        "file-to-pdf",
                        "pdf-to-word",
                        "pdf-to-presentation",
                        "pdf-to-rtf",
                        "pdf-to-html",
                        "pdf-to-xml",
                        "pdf-to-markdown",
                        "html-to-pdf",
                        "eml-to-pdf",
                        "markdown-to-pdf",
                        "pdf-to-epub",
                        "ebook-to-pdf",
                        "pdf-to-pdfa");
        for (String group : standardConverters) {
            endpoints.disableGroup(group);
        }
        for (String endpoint : conversions) {
            assertTrue(endpoints.isEndpointEnabled(endpoint), endpoint);
            endpoints.disableEndpoint(endpoint);
            assertFalse(endpoints.isEndpointEnabled(endpoint), endpoint);
        }
    }

    @Test
    void groupsNamingRetiredToolsLeaveTheirFeaturesEnabled() {
        ApplicationProperties properties = new ApplicationProperties();
        properties
                .getEndpoints()
                .setGroupsToRemove(
                        List.of(
                                "LibreOffice",
                                "Unoconvert",
                                "Weasyprint",
                                "Pdftohtml",
                                "Calibre",
                                "OpenCV",
                                "ImageMagick"));
        EndpointConfiguration endpoints =
                new EndpointConfiguration(properties, false, null, (in, out, t, e) -> {});

        for (String endpoint :
                List.of(
                        "file-to-pdf",
                        "pdf-to-word",
                        "pdf-to-presentation",
                        "pdf-to-rtf",
                        "pdf-to-html",
                        "pdf-to-xml",
                        "pdf-to-pdfa",
                        "pdf-to-markdown",
                        "html-to-pdf",
                        "markdown-to-pdf",
                        "eml-to-pdf",
                        "pdf-to-epub",
                        "ebook-to-pdf",
                        "extract-image-scans",
                        "compress-pdf")) {
            assertTrue(endpoints.isEndpointEnabled(endpoint), endpoint);
        }
        assertTrue(endpoints.isGroupEnabled("LineArt"));
    }

    @Test
    void currentGroupsInConfigAreUnaffected() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getEndpoints().setGroupsToRemove(List.of("veraPDF"));
        EndpointConfiguration endpoints = new EndpointConfiguration(properties, false, null, null);

        assertFalse(endpoints.isEndpointEnabled("verify-pdf"));
        assertTrue(endpoints.isEndpointEnabled("file-to-pdf"));
    }

    @Test
    void lineArtNeedsTheLineArtService() {
        ApplicationProperties properties = new ApplicationProperties();

        assertFalse(
                new EndpointConfiguration(properties, false, null, null).isGroupEnabled("LineArt"));
        assertTrue(
                new EndpointConfiguration(properties, false, null, (in, out, t, e) -> {})
                        .isGroupEnabled("LineArt"));
    }

    @Test
    void lineArtCanStillBeDisabledByItsOwnGroup() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getEndpoints().setGroupsToRemove(List.of("LineArt"));
        EndpointConfiguration endpoints =
                new EndpointConfiguration(properties, false, null, (in, out, t, e) -> {});

        assertFalse(endpoints.isGroupEnabled("LineArt"));
        assertTrue(endpoints.isEndpointEnabled("compress-pdf"));
    }

    @Test
    void endpointKeyForUriExtractsSimpleKebab() {
        assertEquals(
                "remove-pages",
                EndpointConfiguration.endpointKeyForUri("/api/v1/general/remove-pages"));
        assertEquals(
                "compress-pdf",
                EndpointConfiguration.endpointKeyForUri("/api/v1/misc/compress-pdf"));
        assertEquals(
                "add-watermark",
                EndpointConfiguration.endpointKeyForUri("/api/v1/security/add-watermark"));
    }

    @Test
    void endpointKeyForUriComposesConvertEndpoints() {
        assertEquals(
                "pdf-to-img", EndpointConfiguration.endpointKeyForUri("/api/v1/convert/pdf/img"));
        assertEquals(
                "pdf-to-word", EndpointConfiguration.endpointKeyForUri("/api/v1/convert/pdf/word"));
        assertEquals(
                "html-to-pdf", EndpointConfiguration.endpointKeyForUri("/api/v1/convert/html/pdf"));
    }

    @Test
    void endpointKeyForUriReturnsNullForNonApiPaths() {
        assertNull(EndpointConfiguration.endpointKeyForUri(null));
        assertNull(EndpointConfiguration.endpointKeyForUri("/some-page"));
        assertNull(EndpointConfiguration.endpointKeyForUri("/api/v1/general"));
    }
}
