package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.model.ApplicationProperties;

class EndpointConfigurationTest {

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void officeEngineRemainsOptionalWhenStandardConvertersAreUnavailable(boolean officeConversion) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSystem().setStirlingOfficeConversion(officeConversion);
        EndpointConfiguration endpoints = new EndpointConfiguration(properties, false, null);
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
            assertFalse(endpoints.isEndpointEnabled(endpoint), endpoint);
        }
        for (String group : standardConverters) {
            endpoints.enableGroup(group);
        }
        for (String endpoint : conversions) {
            assertTrue(endpoints.isEndpointEnabled(endpoint), endpoint);
            endpoints.disableEndpoint(endpoint);
            assertFalse(endpoints.isEndpointEnabled(endpoint), endpoint);
        }
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
