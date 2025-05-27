package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Calendar;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.controller.api.pipeline.UserServiceInterface;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Premium;
import stirling.software.SPDF.model.ApplicationProperties.Premium.ProFeatures;
import stirling.software.SPDF.model.ApplicationProperties.Premium.ProFeatures.CustomMetadata;
import stirling.software.SPDF.model.PdfMetadata;

class PdfMetadataServiceBasicTest {

    private ApplicationProperties applicationProperties;
    private UserServiceInterface userService;
    private PdfMetadataService pdfMetadataService;
    private final String STIRLING_PDF_LABEL = "Stirling PDF";

    @BeforeEach
    void setUp() {
        // Set up mocks for application properties' nested objects
        applicationProperties = mock(ApplicationProperties.class);
        Premium premium = mock(Premium.class);
        ProFeatures proFeatures = mock(ProFeatures.class);
        CustomMetadata customMetadata = mock(CustomMetadata.class);
        userService = mock(UserServiceInterface.class);

        when(applicationProperties.getPremium()).thenReturn(premium);
        when(premium.getProFeatures()).thenReturn(proFeatures);
        when(proFeatures.getCustomMetadata()).thenReturn(customMetadata);

        // Set up the service under test
        pdfMetadataService =
                new PdfMetadataService(
                        applicationProperties,
                        STIRLING_PDF_LABEL,
                        false, // not running Pro or higher
                        userService);
    }

    @Test
    void testExtractMetadataFromPdf() {
        // Create test document
        PDDocument testDocument = mock(PDDocument.class);
        PDDocumentInformation testInfo = mock(PDDocumentInformation.class);
        when(testDocument.getDocumentInformation()).thenReturn(testInfo);

        // Set up expected metadata values
        String testAuthor = "Test Author";
        String testProducer = "Test Producer";
        String testTitle = "Test Title";
        String testCreator = "Test Creator";
        String testSubject = "Test Subject";
        String testKeywords = "Test Keywords";
        Calendar creationDate = Calendar.getInstance();
        Calendar modificationDate = Calendar.getInstance();

        // Configure mock returns
        when(testInfo.getAuthor()).thenReturn(testAuthor);
        when(testInfo.getProducer()).thenReturn(testProducer);
        when(testInfo.getTitle()).thenReturn(testTitle);
        when(testInfo.getCreator()).thenReturn(testCreator);
        when(testInfo.getSubject()).thenReturn(testSubject);
        when(testInfo.getKeywords()).thenReturn(testKeywords);
        when(testInfo.getCreationDate()).thenReturn(creationDate);
        when(testInfo.getModificationDate()).thenReturn(modificationDate);

        // Act
        PdfMetadata metadata = pdfMetadataService.extractMetadataFromPdf(testDocument);

        // Assert
        assertEquals(testAuthor, metadata.getAuthor(), "Author should match");
        assertEquals(testProducer, metadata.getProducer(), "Producer should match");
        assertEquals(testTitle, metadata.getTitle(), "Title should match");
        assertEquals(testCreator, metadata.getCreator(), "Creator should match");
        assertEquals(testSubject, metadata.getSubject(), "Subject should match");
        assertEquals(testKeywords, metadata.getKeywords(), "Keywords should match");
        assertEquals(creationDate, metadata.getCreationDate(), "Creation date should match");
        assertEquals(
                modificationDate, metadata.getModificationDate(), "Modification date should match");
    }

    @Test
    void testSetDefaultMetadata() {
        // Create test document
        PDDocument testDocument = mock(PDDocument.class);
        PDDocumentInformation testInfo = mock(PDDocumentInformation.class);
        when(testDocument.getDocumentInformation()).thenReturn(testInfo);

        // Act
        pdfMetadataService.setDefaultMetadata(testDocument);

        // Verify basic calls
        verify(testInfo, times(1)).setModificationDate(any(Calendar.class));
        verify(testInfo, times(1)).setProducer(STIRLING_PDF_LABEL);
    }
}
