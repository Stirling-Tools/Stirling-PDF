package stirling.software.SPDF.service.pdfjson;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.lang.reflect.Field;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;

class PdfJsonFontServiceTest {

    private PdfJsonFontService service;
    private TempFileManager tempFileManager;
    private ApplicationProperties applicationProperties;

    @BeforeEach
    void setUp() throws Exception {
        tempFileManager = mock(TempFileManager.class);
        applicationProperties = mock(ApplicationProperties.class);
        service = new PdfJsonFontService(tempFileManager, applicationProperties);
    }

    // --- detectFontFlavor tests ---

    @Test
    void detectFontFlavor_nullBytes_returnsNull() {
        assertNull(service.detectFontFlavor(null));
    }

    @Test
    void detectFontFlavor_tooShort_returnsNull() {
        assertNull(service.detectFontFlavor(new byte[] {0x00, 0x01}));
    }

    @Test
    void detectFontFlavor_ttfSignature_returnsTtf() {
        byte[] ttf = {0x00, 0x01, 0x00, 0x00};
        assertEquals("ttf", service.detectFontFlavor(ttf));
    }

    @Test
    void detectFontFlavor_trueSignature_returnsTtf() {
        // 0x74727565 = "true"
        byte[] trueFont = {0x74, 0x72, 0x75, 0x65};
        assertEquals("ttf", service.detectFontFlavor(trueFont));
    }

    @Test
    void detectFontFlavor_otfSignature_returnsOtf() {
        // 0x4F54544F = "OTTO"
        byte[] otf = {0x4F, 0x54, 0x54, 0x4F};
        assertEquals("otf", service.detectFontFlavor(otf));
    }

    @Test
    void detectFontFlavor_cffSignature_returnsCff() {
        // 0x74746366 = "ttcf"
        byte[] cff = {0x74, 0x74, 0x63, 0x66};
        assertEquals("cff", service.detectFontFlavor(cff));
    }

    @Test
    void detectFontFlavor_unknownSignature_returnsNull() {
        byte[] unknown = {(byte) 0xFF, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF};
        assertNull(service.detectFontFlavor(unknown));
    }

    // --- detectTrueTypeFormat tests ---

    @Test
    void detectTrueTypeFormat_nullBytes_returnsNull() {
        assertNull(service.detectTrueTypeFormat(null));
    }

    @Test
    void detectTrueTypeFormat_tooShort_returnsNull() {
        assertNull(service.detectTrueTypeFormat(new byte[] {0x00}));
    }

    @Test
    void detectTrueTypeFormat_ttfSignature_returnsTtf() {
        byte[] ttf = {0x00, 0x01, 0x00, 0x00};
        assertEquals("ttf", service.detectTrueTypeFormat(ttf));
    }

    @Test
    void detectTrueTypeFormat_otfSignature_returnsOtf() {
        byte[] otf = {0x4F, 0x54, 0x54, 0x4F};
        assertEquals("otf", service.detectTrueTypeFormat(otf));
    }

    @Test
    void detectTrueTypeFormat_cffSignature_returnsCff() {
        byte[] cff = {0x74, 0x74, 0x63, 0x66};
        assertEquals("cff", service.detectTrueTypeFormat(cff));
    }

    @Test
    void detectTrueTypeFormat_unknownSignature_returnsNull() {
        byte[] unknown = {(byte) 0xAB, (byte) 0xCD, (byte) 0xEF, 0x01};
        assertNull(service.detectTrueTypeFormat(unknown));
    }

    // --- validateFontTables tests ---

    @Test
    void validateFontTables_nullBytes_returnsTooSmall() {
        assertEquals("Font program too small", service.validateFontTables(null));
    }

    @Test
    void validateFontTables_tooShort_returnsTooSmall() {
        assertEquals("Font program too small", service.validateFontTables(new byte[11]));
    }

    @Test
    void validateFontTables_zeroNumTables_returnsInvalid() {
        byte[] data = new byte[12];
        // bytes 4-5 = 0 -> numTables = 0
        String result = service.validateFontTables(data);
        assertNotNull(result);
        assertTrue(result.contains("Invalid numTables"));
    }

    @Test
    void validateFontTables_validNumTables_returnsNull() {
        byte[] data = new byte[12];
        // numTables = 10 at bytes[4..5]
        data[4] = 0;
        data[5] = 10;
        assertNull(service.validateFontTables(data));
    }

    @Test
    void validateFontTables_tooManyTables_returnsInvalid() {
        byte[] data = new byte[12];
        // numTables = 513 (> 512)
        data[4] = 0x02;
        data[5] = 0x01; // 513
        String result = service.validateFontTables(data);
        assertNotNull(result);
        assertTrue(result.contains("Invalid numTables"));
    }

    // --- convertCffProgramToTrueType tests ---

    @Test
    void convertCffProgramToTrueType_disabledConversion_returnsNull() {
        // cffConversionEnabled defaults to false since no config loaded
        assertNull(service.convertCffProgramToTrueType(new byte[] {1, 2, 3}, null));
    }

    @Test
    void convertCffProgramToTrueType_nullBytes_returnsNull() {
        assertNull(service.convertCffProgramToTrueType(null, null));
    }

    @Test
    void convertCffProgramToTrueType_emptyBytes_returnsNull() {
        assertNull(service.convertCffProgramToTrueType(new byte[0], null));
    }

    @Test
    void convertCffProgramToTrueType_enabledButPythonNotAvailable_returnsNull() throws Exception {
        // Use reflection to set internal state for testing
        setField(service, "cffConversionEnabled", true);
        setField(service, "cffConverterMethod", "python");
        setField(service, "pythonCffConverterAvailable", false);

        assertNull(service.convertCffProgramToTrueType(new byte[] {1, 2, 3}, null));
    }

    @Test
    void convertCffProgramToTrueType_enabledFontForgeNotAvailable_returnsNull() throws Exception {
        setField(service, "cffConversionEnabled", true);
        setField(service, "cffConverterMethod", "fontforge");
        setField(service, "fontForgeCffConverterAvailable", false);

        assertNull(service.convertCffProgramToTrueType(new byte[] {1, 2, 3}, null));
    }

    @Test
    void convertCffProgramToTrueType_unknownMethodFallsToPython_returnsNull() throws Exception {
        setField(service, "cffConversionEnabled", true);
        setField(service, "cffConverterMethod", "unknown");
        setField(service, "pythonCffConverterAvailable", false);

        assertNull(service.convertCffProgramToTrueType(new byte[] {1, 2, 3}, null));
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }
}
