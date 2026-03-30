package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.misc.MetadataRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MetadataControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @InjectMocks private MetadataController metadataController;

    private PDDocument mockDocument;
    private PDDocumentInformation mockInfo;
    private PDDocumentCatalog mockCatalog;
    private MultipartFile mockFile;

    @BeforeEach
    void setUp() throws IOException {
        mockDocument = mock(PDDocument.class);
        mockInfo = mock(PDDocumentInformation.class);
        mockCatalog = mock(PDDocumentCatalog.class);
        mockFile = mock(MultipartFile.class);

        when(mockFile.getOriginalFilename()).thenReturn("test.pdf");
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

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(mockFile);
        request.setDeleteAll(true);

        try {
            metadataController.metadata(request);
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

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(mockFile);
        request.setDeleteAll(false);
        request.setAuthor("TestAuthor");
        request.setTitle("TestTitle");
        request.setSubject("TestSubject");
        request.setKeywords("key1,key2");
        request.setCreator("TestCreator");
        request.setProducer("TestProducer");
        request.setTrapped("True");
        request.setAllRequestParams(new HashMap<>());

        try {
            metadataController.metadata(request);
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

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(mockFile);
        request.setDeleteAll(false);
        request.setAuthor("undefined");
        request.setTitle("undefined");
        request.setAllRequestParams(new HashMap<>());

        try {
            metadataController.metadata(request);
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

        Map<String, String> params = new HashMap<>();
        params.put("customKey1", "myKey");
        params.put("customValue1", "myValue");

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(mockFile);
        request.setDeleteAll(false);
        request.setAllRequestParams(params);

        try {
            metadataController.metadata(request);
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

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(mockFile);
        request.setDeleteAll(false);
        request.setAllRequestParams(null);

        try {
            metadataController.metadata(request);
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

        Map<String, String> params = new HashMap<>();
        params.put("MyCustomField", "MyCustomValue");

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(mockFile);
        request.setDeleteAll(false);
        request.setAllRequestParams(params);

        try {
            metadataController.metadata(request);
        } catch (Exception e) {
            // Expected
        }

        verify(mockInfo).setCustomMetadataValue("MyCustomField", "MyCustomValue");
    }

    @Test
    void testMetadata_ioExceptionOnLoad() throws Exception {
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true)))
                .thenThrow(new IOException("corrupt"));

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(mockFile);
        request.setDeleteAll(false);
        request.setAllRequestParams(new HashMap<>());

        assertThrows(IOException.class, () -> metadataController.metadata(request));
    }

    @Test
    void testMetadata_standardKeysAreIgnoredInCustomParams() throws Exception {
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(mockDocument);
        when(mockDocument.getDocumentInformation()).thenReturn(mockInfo);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);

        Map<String, String> params = new HashMap<>();
        params.put("Author", "ShouldBeIgnored");
        params.put("Title", "ShouldBeIgnored");
        params.put("Subject", "ShouldBeIgnored");

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(mockFile);
        request.setDeleteAll(false);
        request.setAllRequestParams(params);

        try {
            metadataController.metadata(request);
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

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(mockFile);
        request.setDeleteAll(null); // null should be treated as false
        request.setAllRequestParams(new HashMap<>());

        try {
            metadataController.metadata(request);
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

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(mockFile);
        request.setDeleteAll(false);
        request.setCreationDate("2023/10/01 12:00:00");
        request.setAllRequestParams(new HashMap<>());

        try {
            metadataController.metadata(request);
        } catch (Exception e) {
            // Expected
        }

        verify(mockInfo).setCreationDate(any());
    }
}
