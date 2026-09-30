package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

class EndpointConfigurationTest {

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

    @Test
    void fileToPdfStaysAvailableWithoutLibreOfficeWhenConvertingInProcess() {
        EndpointConfiguration config =
                new EndpointConfiguration(new ApplicationProperties(), false, null);
        config.disableGroup("LibreOffice", EndpointConfiguration.DisableReason.DEPENDENCY);
        config.disableGroup("Unoconvert", EndpointConfiguration.DisableReason.DEPENDENCY);

        assertTrue(config.isEndpointEnabled("file-to-pdf"));
        assertFalse(config.isEndpointEnabled("pdf-to-pdfa"));
    }

    @Test
    void fileToPdfNeedsLibreOfficeWhenTheInProcessConverterIsOff() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getOfficeToPdf().setEngine(ApplicationProperties.OfficeToPdf.Engine.LIBREOFFICE);
        EndpointConfiguration config = new EndpointConfiguration(properties, false, null);
        config.disableGroup("LibreOffice", EndpointConfiguration.DisableReason.DEPENDENCY);
        config.disableGroup("Unoconvert", EndpointConfiguration.DisableReason.DEPENDENCY);

        assertFalse(config.isEndpointEnabled("file-to-pdf"));
    }

    @Test
    void pdfToXmlRunsInProcessWithoutLibreOffice() {
        EndpointConfiguration config =
                new EndpointConfiguration(new ApplicationProperties(), false, null);
        config.disableGroup("LibreOffice", EndpointConfiguration.DisableReason.DEPENDENCY);
        config.disableGroup("Unoconvert", EndpointConfiguration.DisableReason.DEPENDENCY);
        config.disableGroup("CLI", EndpointConfiguration.DisableReason.DEPENDENCY);

        assertTrue(config.isEndpointEnabled("pdf-to-xml"));
        assertTrue(config.getEndpointsForGroup("Java").contains("pdf-to-xml"));
        assertFalse(config.getEndpointsForGroup("LibreOffice").contains("pdf-to-xml"));
    }

    @Test
    void pdfToHtmlNeedsPdftohtmlNotLibreOffice() {
        EndpointConfiguration config =
                new EndpointConfiguration(new ApplicationProperties(), false, null);
        assertFalse(config.getEndpointsForGroup("LibreOffice").contains("pdf-to-html"));

        config.disableGroup("LibreOffice", EndpointConfiguration.DisableReason.DEPENDENCY);
        assertTrue(config.isEndpointEnabled("pdf-to-html"));

        config.enableGroup("LibreOffice");
        config.disableGroup("Pdftohtml", EndpointConfiguration.DisableReason.DEPENDENCY);
        assertFalse(config.isEndpointEnabled("pdf-to-html"));
    }
}
