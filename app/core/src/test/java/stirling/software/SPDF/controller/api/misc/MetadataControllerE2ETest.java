package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Calendar;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.AdobePDFSchema;
import org.apache.xmpbox.schema.DublinCoreSchema;
import org.apache.xmpbox.schema.XMPBasicSchema;
import org.apache.xmpbox.schema.XMPMediaManagementSchema;
import org.apache.xmpbox.schema.XMPSchema;
import org.apache.xmpbox.xml.DomXmpParser;
import org.apache.xmpbox.xml.XmpSerializer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.misc.MetadataRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

@DisplayName("MetadataController & MetadataWriter Full E2E Tests")
class MetadataControllerE2ETest {

    private MetadataController metadataController;
    private PdfMetadataService pdfMetadataService;
    private CustomPDFDocumentFactory pdfDocumentFactory;
    private TempFileManager tempFileManager;

    @BeforeEach
    void setUp() {
        ApplicationProperties appProps = new ApplicationProperties();
        TempFileRegistry registry = new TempFileRegistry();
        tempFileManager = new TempFileManager(registry, appProps);
        pdfMetadataService = new PdfMetadataService(appProps, "Stirling-PDF", false, null);
        pdfDocumentFactory = new CustomPDFDocumentFactory(pdfMetadataService, tempFileManager);
        metadataController =
                new MetadataController(pdfDocumentFactory, tempFileManager, pdfMetadataService);
    }

    private byte[] createBlankPdf() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private byte[] createPdfWithCustomField(String key, String value) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            PDDocumentInformation info = doc.getDocumentInformation();
            info.setCustomMetadataValue(key, value);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private byte[] createPdfWithExistingXmp(
            String oldTitle, String oldAuthor, Calendar oldCreateDate, Calendar oldModifyDate)
            throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());

            PDDocumentInformation info = doc.getDocumentInformation();
            info.setTitle(oldTitle);
            info.setAuthor(oldAuthor);
            info.setCreationDate(oldCreateDate);
            info.setModificationDate(oldModifyDate);

            XMPMetadata xmp = XMPMetadata.createXMPMetadata();
            DublinCoreSchema dc = xmp.createAndAddDublinCoreSchema();
            dc.setTitle(oldTitle);
            dc.addCreator(oldAuthor);

            XMPBasicSchema basic = xmp.createAndAddXMPBasicSchema();
            basic.setCreateDate(oldCreateDate);
            basic.setModifyDate(oldModifyDate);

            ByteArrayOutputStream xmpOut = new ByteArrayOutputStream();
            new XmpSerializer().serialize(xmp, xmpOut, true);

            PDMetadata pdMetadata = new PDMetadata(doc);
            pdMetadata.importXMPMetadata(xmpOut.toByteArray());
            doc.getDocumentCatalog().setMetadata(pdMetadata);

            ByteArrayOutputStream docOut = new ByteArrayOutputStream();
            doc.save(docOut);
            return docOut.toByteArray();
        }
    }

    private PDDocument loadResponsePdf(ResponseEntity<Resource> response) throws IOException {
        assertNotNull(response);
        assertNotNull(response.getBody());
        byte[] bytes = response.getBody().getInputStream().readAllBytes();
        assertTrue(bytes.length > 0, "Response PDF should not be empty");
        return Loader.loadPDF(bytes);
    }

    private XMPMetadata loadXmp(PDDocument doc) throws Exception {
        PDMetadata pdMetadata = doc.getDocumentCatalog().getMetadata();
        assertNotNull(pdMetadata, "XMP Metadata stream should not be null in Catalog");
        DomXmpParser parser = new DomXmpParser();
        parser.setStrictParsing(false);
        return parser.parse(new ByteArrayInputStream(pdMetadata.toByteArray()));
    }

    @Test
    @DisplayName(
            "Full standard metadata round-trip with '1.1.2025' date synchronized in Info & XMP")
    void testStandardMetadataWithDotDate_RoundTrip() throws Exception {
        byte[] inputBytes = createBlankPdf();
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "doc.pdf", "application/pdf", inputBytes);

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(file);
        request.setDeleteAll(false);
        request.setTitle("Quarterly Report 2025");
        request.setAuthor("Balazs Szucs");
        request.setSubject("Financial Analysis");
        request.setKeywords("finance, report, 2025, q1");
        request.setCreator("Stirling PDF Automation");
        request.setProducer("Stirling-PDF Producer");
        request.setTrapped("True");
        request.setCreationDate("1.1.2025");
        request.setModificationDate("1.1.2025");
        request.setAllRequestParams(new HashMap<>());

        ResponseEntity<Resource> response = metadataController.metadata(request);

        try (PDDocument resultDoc = loadResponsePdf(response)) {
            PDDocumentInformation info = resultDoc.getDocumentInformation();
            assertNotNull(info);
            assertEquals("Quarterly Report 2025", info.getTitle());
            assertEquals("Balazs Szucs", info.getAuthor());
            assertEquals("Financial Analysis", info.getSubject());
            assertEquals("finance, report, 2025, q1", info.getKeywords());
            assertEquals("Stirling PDF Automation", info.getCreator());
            assertEquals("Stirling-PDF Producer", info.getProducer());
            assertEquals("True", info.getTrapped());

            Calendar creationDate = info.getCreationDate();
            assertNotNull(creationDate, "Creation date in Info dictionary must not be null");
            assertEquals(2025, creationDate.get(Calendar.YEAR));
            assertEquals(Calendar.JANUARY, creationDate.get(Calendar.MONTH));
            assertEquals(1, creationDate.get(Calendar.DAY_OF_MONTH));

            Calendar modDate = info.getModificationDate();
            assertNotNull(modDate, "Modification date in Info dictionary must not be null");
            assertEquals(2025, modDate.get(Calendar.YEAR));
            assertEquals(Calendar.JANUARY, modDate.get(Calendar.MONTH));
            assertEquals(1, modDate.get(Calendar.DAY_OF_MONTH));

            XMPMetadata xmp = loadXmp(resultDoc);
            assertNotNull(xmp);

            DublinCoreSchema dc = xmp.getDublinCoreSchema();
            assertNotNull(dc);
            assertEquals("Quarterly Report 2025", dc.getTitle());
            assertNotNull(dc.getCreators());
            assertTrue(dc.getCreators().contains("Balazs Szucs"));
            assertEquals("Financial Analysis", dc.getDescription());
            assertNotNull(dc.getSubjects());
            assertTrue(dc.getSubjects().contains("finance"));
            assertTrue(dc.getSubjects().contains("report"));
            assertTrue(dc.getSubjects().contains("2025"));
            assertTrue(dc.getSubjects().contains("q1"));

            XMPBasicSchema basic = xmp.getXMPBasicSchema();
            assertNotNull(basic);
            assertEquals("Stirling PDF Automation", basic.getCreatorTool());
            assertNotNull(basic.getCreateDate());
            assertEquals(2025, basic.getCreateDate().get(Calendar.YEAR));
            assertEquals(Calendar.JANUARY, basic.getCreateDate().get(Calendar.MONTH));
            assertEquals(1, basic.getCreateDate().get(Calendar.DAY_OF_MONTH));
            assertNotNull(basic.getModifyDate());
            assertEquals(2025, basic.getModifyDate().get(Calendar.YEAR));
            assertEquals(Calendar.JANUARY, basic.getModifyDate().get(Calendar.MONTH));
            assertEquals(1, basic.getModifyDate().get(Calendar.DAY_OF_MONTH));
            assertNotNull(basic.getMetadataDate());

            XMPMediaManagementSchema mm = xmp.getXMPMediaManagementSchema();
            assertNotNull(mm);
            assertNotNull(mm.getInstanceID());
            assertTrue(mm.getInstanceID().startsWith("uuid:"));

            AdobePDFSchema pdfSchema = xmp.getAdobePDFSchema();
            assertNotNull(pdfSchema);
            assertEquals("Stirling-PDF Producer", pdfSchema.getProducer());
            assertEquals("finance, report, 2025, q1", pdfSchema.getKeywords());
            assertEquals("True", pdfSchema.getUnqualifiedTextPropertyValue("Trapped"));
        }
    }

    @Test
    @DisplayName(
            "Overwrites pre-existing XMP metadata (Windows Explorer / PDF Property Handler bug fix)")
    void testPreExistingXmpOverwritten_WindowsExplorerCompatibility() throws Exception {
        Calendar oldDate = Calendar.getInstance();
        oldDate.set(2018, Calendar.MAY, 10, 8, 30, 0);

        byte[] inputBytes =
                createPdfWithExistingXmp(
                        "Ancient Old Title", "Ancient Old Author", oldDate, oldDate);

        MockMultipartFile file =
                new MockMultipartFile("fileInput", "doc_old.pdf", "application/pdf", inputBytes);

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(file);
        request.setDeleteAll(false);
        request.setTitle("Brand New Title 2025");
        request.setAuthor("Brand New Author");
        request.setCreationDate("1.1.2025");
        request.setModificationDate("1.1.2025");
        request.setAllRequestParams(new HashMap<>());

        ResponseEntity<Resource> response = metadataController.metadata(request);

        try (PDDocument resultDoc = loadResponsePdf(response)) {
            PDDocumentInformation info = resultDoc.getDocumentInformation();
            assertEquals("Brand New Title 2025", info.getTitle());
            assertEquals("Brand New Author", info.getAuthor());
            assertEquals(2025, info.getCreationDate().get(Calendar.YEAR));
            assertEquals(2025, info.getModificationDate().get(Calendar.YEAR));

            XMPMetadata xmp = loadXmp(resultDoc);
            DublinCoreSchema dc = xmp.getDublinCoreSchema();
            assertEquals("Brand New Title 2025", dc.getTitle());
            assertFalse(
                    dc.getCreators().contains("Ancient Old Author"),
                    "Old author must not remain in XMP");
            assertTrue(
                    dc.getCreators().contains("Brand New Author"),
                    "New author must be present in XMP");

            XMPBasicSchema basic = xmp.getXMPBasicSchema();
            assertEquals(
                    2025,
                    basic.getCreateDate().get(Calendar.YEAR),
                    "Creation date in XMP must be 2025, not 2018");
            assertEquals(
                    Calendar.JANUARY,
                    basic.getCreateDate().get(Calendar.MONTH),
                    "Creation date month must be January");
            assertEquals(
                    1,
                    basic.getCreateDate().get(Calendar.DAY_OF_MONTH),
                    "Creation date day must be 1st");

            assertEquals(
                    2025,
                    basic.getModifyDate().get(Calendar.YEAR),
                    "Modification date in XMP must be 2025, not 2018");
        }
    }

    @Test
    @DisplayName("Randomized custom metadata in paired form format (customKeyN / customValueN)")
    void testRandomizedCustomMetadata_PairedFormat() throws Exception {
        byte[] inputBytes = createBlankPdf();
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "random_custom.pdf", "application/pdf", inputBytes);

        Map<String, String> expectedCustom = new LinkedHashMap<>();
        Map<String, String> requestParams = new HashMap<>();

        Random random = new Random(42);
        for (int i = 1; i <= 15; i++) {
            String key = "CustomField_" + i + "_" + UUID.randomUUID().toString().substring(0, 8);
            String value = "Val_" + random.nextInt(1000000) + "_" + UUID.randomUUID().toString();
            expectedCustom.put(key, value);

            requestParams.put("customKey" + i, key);
            requestParams.put("customValue" + i, value);
        }

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(file);
        request.setDeleteAll(false);
        request.setAllRequestParams(requestParams);

        ResponseEntity<Resource> response = metadataController.metadata(request);

        try (PDDocument resultDoc = loadResponsePdf(response)) {
            PDDocumentInformation info = resultDoc.getDocumentInformation();
            XMPMetadata xmp = loadXmp(resultDoc);
            XMPSchema pdfx = xmp.getSchema(PdfMetadataService.PDFX_NAMESPACE);
            assertNotNull(pdfx, "XMP pdfx schema must be present for custom metadata");

            for (Map.Entry<String, String> entry : expectedCustom.entrySet()) {
                String expectedKey = entry.getKey();
                String expectedVal = entry.getValue();

                assertEquals(
                        expectedVal,
                        info.getCustomMetadataValue(expectedKey),
                        "Custom key " + expectedKey + " must match in /Info dictionary");

                assertEquals(
                        expectedVal,
                        pdfx.getUnqualifiedTextPropertyValue(expectedKey),
                        "Custom key " + expectedKey + " must match in XMP pdfx schema");
            }
        }
    }

    @Test
    @DisplayName("Single unindexed custom metadata pair (customKey / customValue)")
    void testUnindexedCustomMetadataPair() throws Exception {
        byte[] inputBytes = createBlankPdf();
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "single_pair.pdf", "application/pdf", inputBytes);

        Map<String, String> requestParams = new HashMap<>();
        requestParams.put("customKey", "Department");
        requestParams.put("customValue", "Engineering");

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(file);
        request.setDeleteAll(false);
        request.setAllRequestParams(requestParams);

        ResponseEntity<Resource> response = metadataController.metadata(request);

        try (PDDocument resultDoc = loadResponsePdf(response)) {
            PDDocumentInformation info = resultDoc.getDocumentInformation();
            assertEquals("Engineering", info.getCustomMetadataValue("Department"));

            XMPMetadata xmp = loadXmp(resultDoc);
            XMPSchema pdfx = xmp.getSchema(PdfMetadataService.PDFX_NAMESPACE);
            assertNotNull(pdfx);
            assertEquals("Engineering", pdfx.getUnqualifiedTextPropertyValue("Department"));
        }
    }

    @Test
    @DisplayName("Direct key-value custom metadata map in allRequestParams")
    void testDirectCustomMetadataMap() throws Exception {
        byte[] inputBytes = createBlankPdf();
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "direct_map.pdf", "application/pdf", inputBytes);

        Map<String, String> requestParams = new LinkedHashMap<>();
        requestParams.put("ProjectName", "Gemini-Apollo");
        requestParams.put("SecurityClearance", "Level-5");
        requestParams.put("CostCenter", "CC-4002");

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(file);
        request.setDeleteAll(false);
        request.setAllRequestParams(requestParams);

        ResponseEntity<Resource> response = metadataController.metadata(request);

        try (PDDocument resultDoc = loadResponsePdf(response)) {
            PDDocumentInformation info = resultDoc.getDocumentInformation();
            assertEquals("Gemini-Apollo", info.getCustomMetadataValue("ProjectName"));
            assertEquals("Level-5", info.getCustomMetadataValue("SecurityClearance"));
            assertEquals("CC-4002", info.getCustomMetadataValue("CostCenter"));

            XMPMetadata xmp = loadXmp(resultDoc);
            XMPSchema pdfx = xmp.getSchema(PdfMetadataService.PDFX_NAMESPACE);
            assertNotNull(pdfx);
            assertEquals("Gemini-Apollo", pdfx.getUnqualifiedTextPropertyValue("ProjectName"));
            assertEquals("Level-5", pdfx.getUnqualifiedTextPropertyValue("SecurityClearance"));
            assertEquals("CC-4002", pdfx.getUnqualifiedTextPropertyValue("CostCenter"));
        }
    }

    @Test
    @DisplayName(
            "Multipart HttpServletRequest parameters with bracket notation and top-level fields")
    void testMultipartServletRequest_BracketAndTopLevelParams() throws Exception {
        byte[] inputBytes = createBlankPdf();
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "servlet_request.pdf", "application/pdf", inputBytes);

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(file);
        request.setDeleteAll(false);

        MockHttpServletRequest servletRequest = new MockHttpServletRequest();
        servletRequest.setParameter("allRequestParams[ClientName]", "Acme Corporation");
        servletRequest.setParameter("allRequestParams[ContractId]", "CTR-2025-001");
        servletRequest.setParameter("customKey1", "LeadArchitect");
        servletRequest.setParameter("customValue1", "Jane Doe");
        servletRequest.setParameter("DocumentVersion", "3.2.1");

        ResponseEntity<Resource> response = metadataController.metadata(request, servletRequest);

        try (PDDocument resultDoc = loadResponsePdf(response)) {
            PDDocumentInformation info = resultDoc.getDocumentInformation();
            assertEquals("Acme Corporation", info.getCustomMetadataValue("ClientName"));
            assertEquals("CTR-2025-001", info.getCustomMetadataValue("ContractId"));
            assertEquals("Jane Doe", info.getCustomMetadataValue("LeadArchitect"));
            assertEquals("3.2.1", info.getCustomMetadataValue("DocumentVersion"));

            XMPMetadata xmp = loadXmp(resultDoc);
            XMPSchema pdfx = xmp.getSchema(PdfMetadataService.PDFX_NAMESPACE);
            assertNotNull(pdfx);
            assertEquals("Acme Corporation", pdfx.getUnqualifiedTextPropertyValue("ClientName"));
            assertEquals("CTR-2025-001", pdfx.getUnqualifiedTextPropertyValue("ContractId"));
            assertEquals("Jane Doe", pdfx.getUnqualifiedTextPropertyValue("LeadArchitect"));
            assertEquals("3.2.1", pdfx.getUnqualifiedTextPropertyValue("DocumentVersion"));
        }
    }

    @Test
    @DisplayName("Custom metadata deletion: removed keys are purged from both /Info and XMP")
    void testCustomMetadataDeletion() throws Exception {
        byte[] inputBytes = createBlankPdf();
        MockMultipartFile file1 =
                new MockMultipartFile("fileInput", "initial.pdf", "application/pdf", inputBytes);

        MetadataRequest req1 = new MetadataRequest();
        req1.setFileInput(file1);
        req1.setDeleteAll(false);
        req1.setAllRequestParams(
                Map.of(
                        "customKey1",
                        "FieldA",
                        "customValue1",
                        "ValueA",
                        "customKey2",
                        "FieldB",
                        "customValue2",
                        "ValueB",
                        "customKey3",
                        "FieldC",
                        "customValue3",
                        "ValueC"));

        ResponseEntity<Resource> res1 = metadataController.metadata(req1);
        byte[] step1Bytes = res1.getBody().getInputStream().readAllBytes();

        MockMultipartFile file2 =
                new MockMultipartFile("fileInput", "step2.pdf", "application/pdf", step1Bytes);

        MetadataRequest req2 = new MetadataRequest();
        req2.setFileInput(file2);
        req2.setDeleteAll(false);
        req2.setAllRequestParams(
                Map.of(
                        "customKey1",
                        "FieldB",
                        "customValue1",
                        "ValueB_Updated",
                        "customKey2",
                        "FieldD",
                        "customValue2",
                        "ValueD_New"));

        ResponseEntity<Resource> res2 = metadataController.metadata(req2);

        try (PDDocument resultDoc = loadResponsePdf(res2)) {
            PDDocumentInformation info = resultDoc.getDocumentInformation();
            assertNull(
                    info.getCustomMetadataValue("FieldA"),
                    "FieldA must be removed from /Info dictionary");
            assertNull(
                    info.getCustomMetadataValue("FieldC"),
                    "FieldC must be removed from /Info dictionary");
            assertEquals("ValueB_Updated", info.getCustomMetadataValue("FieldB"));
            assertEquals("ValueD_New", info.getCustomMetadataValue("FieldD"));

            XMPMetadata xmp = loadXmp(resultDoc);
            XMPSchema pdfx = xmp.getSchema(PdfMetadataService.PDFX_NAMESPACE);
            assertNotNull(pdfx);
            assertNull(
                    pdfx.getUnqualifiedTextPropertyValue("FieldA"),
                    "FieldA must be removed from XMP pdfx schema");
            assertNull(
                    pdfx.getUnqualifiedTextPropertyValue("FieldC"),
                    "FieldC must be removed from XMP pdfx schema");
            assertEquals("ValueB_Updated", pdfx.getUnqualifiedTextPropertyValue("FieldB"));
            assertEquals("ValueD_New", pdfx.getUnqualifiedTextPropertyValue("FieldD"));
        }
    }

    @Test
    @DisplayName("deleteAll = true completely purges /Info, XMP stream, and catalog PieceInfo")
    void testDeleteAllPurgesInfoAndXmp() throws Exception {
        Calendar oldDate = Calendar.getInstance();
        oldDate.set(2022, Calendar.AUGUST, 15, 10, 0, 0);

        byte[] inputBytes =
                createPdfWithExistingXmp("To Delete", "Delete Author", oldDate, oldDate);

        MockMultipartFile file =
                new MockMultipartFile("fileInput", "delete_all.pdf", "application/pdf", inputBytes);

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(file);
        request.setDeleteAll(true);

        ResponseEntity<Resource> response = metadataController.metadata(request);

        try (PDDocument resultDoc = loadResponsePdf(response)) {
            PDDocumentInformation info = resultDoc.getDocumentInformation();
            assertNull(info.getTitle());
            assertNull(info.getAuthor());
            assertNull(info.getCreationDate());
            assertNull(info.getModificationDate());

            PDDocumentCatalog catalog = resultDoc.getDocumentCatalog();
            assertNull(catalog.getMetadata(), "Catalog XMP metadata must be null after deleteAll");
        }
    }

    @Test
    @DisplayName("Various date formats are accurately parsed and saved in Info and XMP")
    void testVariousDateFormatsSupported() throws Exception {
        String[] dateInputs =
                new String[] {
                    "2025/01/15 10:20:30",
                    "2025-01-15 10:20:30",
                    "2025-01-15",
                    "2025/01/15",
                    "15.1.2025",
                    "15.01.2025 10:20:30",
                    "2025-01-15T10:20:30Z",
                    "D:20250115102030"
                };

        for (String dateStr : dateInputs) {
            byte[] inputBytes = createBlankPdf();
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "test_date.pdf", "application/pdf", inputBytes);

            MetadataRequest request = new MetadataRequest();
            request.setFileInput(file);
            request.setDeleteAll(false);
            request.setCreationDate(dateStr);
            request.setModificationDate(dateStr);

            ResponseEntity<Resource> response = metadataController.metadata(request);

            try (PDDocument resultDoc = loadResponsePdf(response)) {
                PDDocumentInformation info = resultDoc.getDocumentInformation();
                assertNotNull(
                        info.getCreationDate(),
                        "Creation date must be parsed for format: " + dateStr);
                assertEquals(
                        2025,
                        info.getCreationDate().get(Calendar.YEAR),
                        "Year must be 2025 for: " + dateStr);
                assertEquals(
                        Calendar.JANUARY,
                        info.getCreationDate().get(Calendar.MONTH),
                        "Month must be January for: " + dateStr);
                assertEquals(
                        15,
                        info.getCreationDate().get(Calendar.DAY_OF_MONTH),
                        "Day must be 15 for: " + dateStr);

                XMPMetadata xmp = loadXmp(resultDoc);
                XMPBasicSchema basic = xmp.getXMPBasicSchema();
                assertNotNull(
                        basic.getCreateDate(),
                        "XMP CreateDate must be present for format: " + dateStr);
                assertEquals(
                        2025,
                        basic.getCreateDate().get(Calendar.YEAR),
                        "XMP Year must be 2025 for: " + dateStr);
                assertEquals(
                        Calendar.JANUARY,
                        basic.getCreateDate().get(Calendar.MONTH),
                        "XMP Month must be January for: " + dateStr);
                assertEquals(
                        15,
                        basic.getCreateDate().get(Calendar.DAY_OF_MONTH),
                        "XMP Day must be 15 for: " + dateStr);
            }
        }
    }

    @Test
    @DisplayName("Updates custom metadata case-insensitively without losing existing keys")
    void testCaseInsensitiveCustomKeyUpdate() throws Exception {
        byte[] pdfWithCustom = createPdfWithCustomField("ProjectCode", "Apollo-11");
        MockMultipartFile inputFile =
                new MockMultipartFile("fileInput", "test.pdf", "application/pdf", pdfWithCustom);

        MetadataRequest request = new MetadataRequest();
        request.setFileInput(inputFile);
        request.setAllRequestParams(Map.of("projectcode", "Apollo-12"));

        ResponseEntity<Resource> response = metadataController.metadata(request);
        byte[] resultBytes = response.getBody().getContentAsByteArray();

        try (PDDocument resultDoc = Loader.loadPDF(resultBytes)) {
            PDDocumentInformation info = resultDoc.getDocumentInformation();
            assertEquals("Apollo-12", info.getCustomMetadataValue("projectcode"));

            XMPMetadata xmp = loadXmp(resultDoc);
            XMPSchema pdfx = xmp.getSchema(PdfMetadataService.PDFX_NAMESPACE);
            assertNotNull(pdfx);
            assertEquals("Apollo-12", pdfx.getUnqualifiedTextPropertyValue("projectcode"));
        }
    }
}
