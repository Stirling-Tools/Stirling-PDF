package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.io.IOException;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MetadataControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @InjectMocks private MetadataController metadataController;

    private PDDocument mockDocument;
    private PDDocumentInformation mockInfo;
    private PDDocumentCatalog mockCatalog;
    private FileUpload fileUpload;

    @BeforeEach
    void setUp() throws IOException {
        mockDocument = mock(PDDocument.class);
        mockInfo = mock(PDDocumentInformation.class);
        mockCatalog = mock(PDDocumentCatalog.class);
        // Backed by a real temp file named test.pdf so the controller's filename derivation works.
        fileUpload = TestFileUploads.pdf("PDF content".getBytes());
    }

    @Test
    void testCheckUndefined_returnsNullForUndefined() throws Exception {
        var method = MetadataController.class.getDeclaredMethod("checkUndefined", String.class);
        method.setAccessible(true);
        assertNull(method.invoke(metadataController, "undefined"));
    }

    @Test
    void testCheckUndefined_returnsValueForNonUndefined() throws Exception {
        var method = MetadataController.class.getDeclaredMethod("checkUndefined", String.class);
        method.setAccessible(true);
        assertEquals("hello", method.invoke(metadataController, "hello"));
    }

    @Test
    void testCheckUndefined_returnsNullForNull() throws Exception {
        var method = MetadataController.class.getDeclaredMethod("checkUndefined", String.class);
        method.setAccessible(true);
        assertNull(method.invoke(metadataController, (String) null));
    }

    @Test
    void testMetadata_deleteAllClearsAllMetadata() throws Exception {
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(mockDocument);
        when(mockDocument.getDocumentInformation()).thenReturn(mockInfo);
        when(mockInfo.getMetadataKeys()).thenReturn(java.util.Collections.emptySet());
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        COSDictionary cosDict = mock(COSDictionary.class);
        when(mockCatalog.getCOSObject()).thenReturn(cosDict);

        try {
            metadataController.metadata(
                    fileUpload, true, null, null, null, null, null, null, null, null, null, null);
        } catch (Exception e) {
            // WebResponseUtils.pdfDocToWebResponse may fail in test context
            // but we verify the delete-all logic executed
        }

        verify(mockInfo).getMetadataKeys();
        verify(cosDict, times(2)).removeItem(any());
    }

    @Test
    void testMetadata_setsStandardFieldsWhenNotDeleteAll() throws Exception {
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(mockDocument);
        when(mockDocument.getDocumentInformation()).thenReturn(mockInfo);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);

        try {
            metadataController.metadata(
                    fileUpload,
                    false,
                    "TestAuthor",
                    null,
                    "TestCreator",
                    "key1,key2",
                    null,
                    "TestProducer",
                    "TestSubject",
                    "TestTitle",
                    "True",
                    null);
        } catch (Exception e) {
            // Expected - pdfDocToWebResponse may fail
        }

        verify(mockInfo).setAuthor("TestAuthor");
        verify(mockInfo).setTitle("TestTitle");
        verify(mockInfo).setSubject("TestSubject");
        verify(mockInfo).setKeywords("key1,key2");
        verify(mockInfo).setCreator("TestCreator");
        verify(mockInfo).setProducer("TestProducer");
        verify(mockInfo).setTrapped("True");
    }

    @Test
    void testMetadata_undefinedFieldsSetToNull() throws Exception {
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(mockDocument);
        when(mockDocument.getDocumentInformation()).thenReturn(mockInfo);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);

        try {
            metadataController.metadata(
                    fileUpload,
                    false,
                    "undefined",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    "undefined",
                    null,
                    null);
        } catch (Exception e) {
            // Expected
        }

        verify(mockInfo).setAuthor(null);
        verify(mockInfo).setTitle(null);
    }

    @Test
    void testMetadata_customParamsAreSet() throws Exception {
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(mockDocument);
        when(mockDocument.getDocumentInformation()).thenReturn(mockInfo);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);

        String params = "{\"customKey1\":\"myKey\",\"customValue1\":\"myValue\"}";

        try {
            metadataController.metadata(
                    fileUpload,
                    false,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    params);
        } catch (Exception e) {
            // Expected
        }

        verify(mockInfo).setCustomMetadataValue("myKey", "myValue");
    }

    @Test
    void testMetadata_nullAllRequestParamsDefaultsToEmptyMap() throws Exception {
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(mockDocument);
        when(mockDocument.getDocumentInformation()).thenReturn(mockInfo);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);

        try {
            metadataController.metadata(
                    fileUpload, false, null, null, null, null, null, null, null, null, null, null);
        } catch (Exception e) {
            // Expected
        }

        // Should not throw NPE - null params handled gracefully
        verify(mockDocument).setDocumentInformation(mockInfo);
    }

    @Test
    void testMetadata_nonStandardKeyIsSetAsCustomMetadata() throws Exception {
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(mockDocument);
        when(mockDocument.getDocumentInformation()).thenReturn(mockInfo);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);

        String params = "{\"MyCustomField\":\"MyCustomValue\"}";

        try {
            metadataController.metadata(
                    fileUpload,
                    false,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    params);
        } catch (Exception e) {
            // Expected
        }

        verify(mockInfo).setCustomMetadataValue("MyCustomField", "MyCustomValue");
    }

    @Test
    void testMetadata_ioExceptionOnLoad() throws Exception {
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true)))
                .thenThrow(new IOException("corrupt"));

        assertThrows(
                IOException.class,
                () ->
                        metadataController.metadata(
                                fileUpload,
                                false,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null));
    }

    @Test
    void testMetadata_standardKeysAreIgnoredInCustomParams() throws Exception {
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(mockDocument);
        when(mockDocument.getDocumentInformation()).thenReturn(mockInfo);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);

        String params =
                "{\"Author\":\"ShouldBeIgnored\",\"Title\":\"ShouldBeIgnored\","
                        + "\"Subject\":\"ShouldBeIgnored\"}";

        try {
            metadataController.metadata(
                    fileUpload,
                    false,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    params);
        } catch (Exception e) {
            // Expected
        }

        // Standard keys in allRequestParams should not be set via setCustomMetadataValue
        verify(mockInfo, never()).setCustomMetadataValue(eq("Author"), any());
        verify(mockInfo, never()).setCustomMetadataValue(eq("Title"), any());
        verify(mockInfo, never()).setCustomMetadataValue(eq("Subject"), any());
    }

    @Test
    void testMetadata_deleteAll_nullDeleteAllDefaultsToFalse() throws Exception {
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(mockDocument);
        when(mockDocument.getDocumentInformation()).thenReturn(mockInfo);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);

        try {
            metadataController.metadata(
                    fileUpload, null, null, null, null, null, null, null, null, null, null, null);
        } catch (Exception e) {
            // Expected
        }

        // Should not call getMetadataKeys (that's only done when deleteAll=true)
        verify(mockInfo, never()).getMetadataKeys();
    }

    @Test
    void testMetadata_creationDateSet() throws Exception {
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(mockDocument);
        when(mockDocument.getDocumentInformation()).thenReturn(mockInfo);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);

        try {
            metadataController.metadata(
                    fileUpload,
                    false,
                    null,
                    "2023/10/01 12:00:00",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null);
        } catch (Exception e) {
            // Expected
        }

        verify(mockInfo).setCreationDate(any());
    }
}
