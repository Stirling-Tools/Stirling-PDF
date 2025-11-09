package stirling.software.SPDF.controller.api;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.SplitPdfBySizeOrCountRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class SplitPdfBySizeControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private SplitPdfBySizeController controller;

    private byte[] samplePdfBytes;
    private MockMultipartFile multipartFile;
    private Path tempZipPath;

    @BeforeEach
    void setUp() throws Exception {
        try (PDDocument document = new PDDocument()) {
            for (int i = 0; i < 5; i++) {
                document.addPage(new PDPage());
            }
            try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                document.save(out);
                samplePdfBytes = out.toByteArray();
            }
        }

        multipartFile =
                new MockMultipartFile("fileInput", "sample.pdf", "application/pdf", samplePdfBytes);

        tempZipPath = Files.createTempFile("split-pdf", ".zip");

        Mockito.when(tempFileManager.createTempFile(Mockito.anyString()))
                .thenReturn(tempZipPath.toFile());
        Mockito.when(tempFileManager.deleteTempFile(Mockito.any(File.class)))
                .thenAnswer(
                        invocation -> {
                            File file = invocation.getArgument(0);
                            Files.deleteIfExists(file.toPath());
                            return true;
                        });
        Mockito.when(pdfDocumentFactory.load(Mockito.any(byte[].class)))
                .thenAnswer(invocation -> Loader.loadPDF((byte[]) invocation.getArgument(0)));
        Mockito.when(
                        pdfDocumentFactory.createNewDocumentBasedOnOldDocument(
                                Mockito.any(PDDocument.class)))
                .thenAnswer(invocation -> new PDDocument());
    }

    @AfterEach
    void tearDown() throws Exception {
        if (tempZipPath != null) {
            Files.deleteIfExists(tempZipPath);
        }
    }

    @ParameterizedTest(name = "{index}: splitType={0}, splitValue={1}")
    @CsvSource(
            delimiterString = "|", // Use a custom delimiter to avoid confusion
            value = {
                "0 | 2MB | 1 | sample_1.pdf | 5",
                "1 | 3   | 2 | sample_1.pdf,sample_2.pdf | 3,2",
                "2 | 2   | 2 | sample_1.pdf,sample_2.pdf | 3,2"
            })
    @DisplayName("Splits PDF by page count and returns ZIP with expected documents")
    void splitByPageCountProducesExpectedZip(
            Integer splitType,
            String splitValue,
            int expectedFileCount,
            String expectedEntryNamesCsv,
            String expectedPageCountsCsv)
            throws Exception {

        SplitPdfBySizeOrCountRequest request = new SplitPdfBySizeOrCountRequest();
        request.setSplitType(splitType);
        request.setSplitValue(splitValue);
        request.setFileInput(multipartFile);

        ResponseEntity<byte[]> response = controller.autoSplitPdf(request);

        Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
        Assertions.assertEquals(
                MediaType.APPLICATION_OCTET_STREAM, response.getHeaders().getContentType());
        Assertions.assertEquals(
                "sample.zip", response.getHeaders().getContentDisposition().getFilename());
        Assertions.assertNotNull(response.getBody());

        List<String> entryNames = new ArrayList<>();
        List<Integer> pageCounts = new ArrayList<>();

        try (ZipInputStream zipInputStream =
                new ZipInputStream(new ByteArrayInputStream(response.getBody()))) {
            ZipEntry entry;
            byte[] buffer = new byte[1024];
            while ((entry = zipInputStream.getNextEntry()) != null) {
                entryNames.add(entry.getName());
                try (ByteArrayOutputStream entryOut = new ByteArrayOutputStream()) {
                    int read;
                    while ((read = zipInputStream.read(buffer)) != -1) {
                        entryOut.write(buffer, 0, read);
                    }
                    try (PDDocument partDoc = Loader.loadPDF(entryOut.toByteArray())) {
                        pageCounts.add(partDoc.getNumberOfPages());
                    }
                }
                zipInputStream.closeEntry();
            }
        }

        // Parse expected names
        List<String> expectedNames =
                Arrays.stream(expectedEntryNamesCsv.split(","))
                        .map(String::trim)
                        .collect(Collectors.toList());

        // Parse expected page counts from CSV string
        List<Integer> expectedPageCounts =
                Arrays.stream(expectedPageCountsCsv.split(","))
                        .map(String::trim)
                        .map(Integer::parseInt)
                        .collect(Collectors.toList());

        Assertions.assertEquals(expectedNames, entryNames);
        Assertions.assertEquals(expectedPageCounts, pageCounts);
        Assertions.assertEquals(expectedFileCount, entryNames.size());
    }
}
