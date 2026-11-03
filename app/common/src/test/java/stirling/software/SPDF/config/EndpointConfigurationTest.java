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
    void officeEngineKeepsSupportedEndpointsAvailableWithoutExternalConverters() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSystem().setStirlingOfficeConversion(true);
        EndpointConfiguration endpoints = new EndpointConfiguration(properties, false, null);
        for (String group :
                List.of("LibreOffice", "Unoconvert", "Weasyprint", "Pdftohtml", "Calibre")) {
            endpoints.disableGroup(group);
        }
        for (String endpoint :
                List.of(
                        "file-to-pdf",
                        "pdf-to-word",
                        "pdf-to-html",
                        "pdf-to-xml",
                        "pdf-to-markdown",
                        "html-to-pdf",
                        "pdf-to-epub",
                        "ebook-to-pdf",
                        "pdf-to-pdfa")) {
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
