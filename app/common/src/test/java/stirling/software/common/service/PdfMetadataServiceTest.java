package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Calendar;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Premium;
import stirling.software.common.model.ApplicationProperties.Premium.ProFeatures;
import stirling.software.common.model.ApplicationProperties.Premium.ProFeatures.CustomMetadata;
import stirling.software.common.model.PdfMetadata;

class PdfMetadataServiceTest {

    private static final String LABEL = "Stirling-PDF v1.0.0";

    /**
     * Builds a service whose pro-features are disabled (real ApplicationProperties, all defaults).
     */
    private PdfMetadataService nonProService(UserServiceInterface userService) {
        return new PdfMetadataService(new ApplicationProperties(), LABEL, false, userService);
    }

    @Nested
    @DisplayName("toCalendar(ZonedDateTime)")
    class ToCalendarTests {

        @Test
        @DisplayName("returns null for null input")
        void nullReturnsNull() {
            assertNull(PdfMetadataService.toCalendar(null));
        }

        @Test
        @DisplayName("converts ZonedDateTime preserving the instant")
        void convertsInstant() {
            ZonedDateTime zdt = ZonedDateTime.of(2021, 6, 15, 10, 30, 45, 0, ZoneId.of("UTC"));
            Calendar cal = PdfMetadataService.toCalendar(zdt);

            assertNotNull(cal);
            assertEquals(zdt.toInstant().toEpochMilli(), cal.getTimeInMillis());
        }
    }

    @Nested
    @DisplayName("parseToCalendar(String)")
    class ParseToCalendarTests {

        @Test
        @DisplayName("returns null for null input")
        void nullReturnsNull() {
            assertNull(PdfMetadataService.parseToCalendar(null));
        }

        @Test
        @DisplayName("returns null for empty / blank input")
        void blankReturnsNull() {
            assertNull(PdfMetadataService.parseToCalendar(""));
            assertNull(PdfMetadataService.parseToCalendar("   "));
        }

        @Test
        @DisplayName("returns null for unparsable input")
        void invalidReturnsNull() {
            assertNull(PdfMetadataService.parseToCalendar("not a date"));
            assertNull(PdfMetadataService.parseToCalendar("2021-06-15"));
            assertNull(PdfMetadataService.parseToCalendar("2021/13/40 99:99:99"));
        }

        @Test
        @DisplayName("parses a valid 'yyyy/MM/dd HH:mm:ss' string")
        void parsesValidDate() {
            Calendar cal = PdfMetadataService.parseToCalendar("2021/06/15 10:30:45");
            assertNotNull(cal);

            // Build the expected instant the same way the implementation does so the
            // assertion is independent of the JVM's default time zone.
            long expectedMillis =
                    LocalDateTime.of(2021, 6, 15, 10, 30, 45)
                            .atZone(ZoneId.systemDefault())
                            .toInstant()
                            .toEpochMilli();
            assertEquals(expectedMillis, cal.getTimeInMillis());
        }
    }

    @Nested
    @DisplayName("extractMetadataFromPdf(PDDocument)")
    class ExtractMetadataTests {

        @Test
        @DisplayName("returns all-null fields for a fresh empty document")
        void emptyDocumentYieldsNulls() throws Exception {
            PdfMetadataService service = nonProService(null);
            try (PDDocument doc = new PDDocument()) {
                PdfMetadata md = service.extractMetadataFromPdf(doc);

                assertNotNull(md);
                assertNull(md.getAuthor());
                assertNull(md.getProducer());
                assertNull(md.getTitle());
                assertNull(md.getCreator());
                assertNull(md.getSubject());
                assertNull(md.getKeywords());
                assertNull(md.getCreationDate());
                assertNull(md.getModificationDate());
            }
        }

        @Test
        @DisplayName("reads back string and date fields set on the document")
        void readsBackPopulatedFields() throws Exception {
            PdfMetadataService service = nonProService(null);
            try (PDDocument doc = new PDDocument()) {
                PDDocumentInformation info = doc.getDocumentInformation();
                info.setAuthor("Alice");
                info.setProducer("ProducerX");
                info.setTitle("My Title");
                info.setCreator("CreatorY");
                info.setSubject("Subject Z");
                info.setKeywords("k1, k2");

                Calendar creation = Calendar.getInstance();
                creation.setTimeInMillis(1_600_000_000_000L);
                Calendar modification = Calendar.getInstance();
                modification.setTimeInMillis(1_700_000_000_000L);
                info.setCreationDate(creation);
                info.setModificationDate(modification);

                PdfMetadata md = service.extractMetadataFromPdf(doc);

                assertEquals("Alice", md.getAuthor());
                assertEquals("ProducerX", md.getProducer());
                assertEquals("My Title", md.getTitle());
                assertEquals("CreatorY", md.getCreator());
                assertEquals("Subject Z", md.getSubject());
                assertEquals("k1, k2", md.getKeywords());

                assertNotNull(md.getCreationDate());
                assertNotNull(md.getModificationDate());
                assertEquals(1_600_000_000_000L, md.getCreationDate().toInstant().toEpochMilli());
                assertEquals(
                        1_700_000_000_000L, md.getModificationDate().toInstant().toEpochMilli());
            }
        }
    }

    @Nested
    @DisplayName("setMetadataToPdf / setDefaultMetadata (non-pro path)")
    class SetMetadataNonProTests {

        @Test
        @DisplayName("writes producer label, title, subject, keywords and author from metadata")
        void writesCommonMetadata() throws Exception {
            PdfMetadataService service = nonProService(null);
            PdfMetadata md =
                    PdfMetadata.builder()
                            .author("Bob")
                            .title("Doc Title")
                            .subject("Doc Subject")
                            .keywords("a, b, c")
                            .creationDate(
                                    ZonedDateTime.of(2020, 1, 1, 0, 0, 0, 0, ZoneId.of("UTC")))
                            .modificationDate(
                                    ZonedDateTime.of(2021, 1, 1, 0, 0, 0, 0, ZoneId.of("UTC")))
                            .build();

            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());
                service.setMetadataToPdf(doc, md);

                PDDocumentInformation info = doc.getDocumentInformation();
                assertEquals(LABEL, info.getProducer());
                assertEquals("Doc Title", info.getTitle());
                assertEquals("Doc Subject", info.getSubject());
                assertEquals("a, b, c", info.getKeywords());
                // Non-pro: author is taken verbatim from the metadata.
                assertEquals("Bob", info.getAuthor());
                assertNotNull(info.getModificationDate());
            }
        }

        @Test
        @DisplayName("existing creation date is left untouched when not newly created")
        void keepsExistingCreationDate() throws Exception {
            PdfMetadataService service = nonProService(null);
            ZonedDateTime creation = ZonedDateTime.of(2019, 5, 20, 8, 15, 0, 0, ZoneId.of("UTC"));
            PdfMetadata md = PdfMetadata.builder().title("T").creationDate(creation).build();

            try (PDDocument doc = new PDDocument()) {
                service.setMetadataToPdf(doc, md);

                Calendar creationCal = doc.getDocumentInformation().getCreationDate();
                // creationDate is non-null and newlyCreated=false, so setNewDocumentMetadata
                // is skipped and no creation date is written.
                assertNull(creationCal);
            }
        }

        @Test
        @DisplayName("sets a fresh creation date when metadata has none")
        void setsCreationDateWhenMissing() throws Exception {
            PdfMetadataService service = nonProService(null);
            PdfMetadata md = PdfMetadata.builder().title("T").build();

            try (PDDocument doc = new PDDocument()) {
                service.setMetadataToPdf(doc, md);

                Calendar creationCal = doc.getDocumentInformation().getCreationDate();
                assertNotNull(creationCal);
                // Non-pro path writes the Stirling label as the creator.
                assertEquals(LABEL, doc.getDocumentInformation().getCreator());
            }
        }

        @Test
        @DisplayName("newlyCreated=true forces a fresh creation date even if metadata has one")
        void newlyCreatedForcesCreationDate() throws Exception {
            PdfMetadataService service = nonProService(null);
            ZonedDateTime creation = ZonedDateTime.of(2018, 3, 3, 3, 3, 3, 0, ZoneId.of("UTC"));
            PdfMetadata md = PdfMetadata.builder().title("T").creationDate(creation).build();

            try (PDDocument doc = new PDDocument()) {
                service.setMetadataToPdf(doc, md, true);

                Calendar creationCal = doc.getDocumentInformation().getCreationDate();
                assertNotNull(creationCal);
                // The supplied creation date must have been honoured (not "now").
                assertEquals(creation.toInstant().toEpochMilli(), creationCal.getTimeInMillis());
                assertEquals(LABEL, doc.getDocumentInformation().getCreator());
            }
        }

        @Test
        @DisplayName(
                "setDefaultMetadata round-trips existing document info through the producer label")
        void setDefaultMetadataRewritesProducer() throws Exception {
            PdfMetadataService service = nonProService(null);
            try (PDDocument doc = new PDDocument()) {
                PDDocumentInformation info = doc.getDocumentInformation();
                info.setTitle("Original Title");
                info.setAuthor("Original Author");
                info.setProducer("Some Other Producer");

                service.setDefaultMetadata(doc);

                // extract + re-apply keeps title/author but rewrites producer to the label.
                assertEquals("Original Title", info.getTitle());
                assertEquals("Original Author", info.getAuthor());
                assertEquals(LABEL, info.getProducer());
            }
        }

        @Test
        @DisplayName("null string fields in metadata are written through without error")
        void handlesNullStringFields() throws Exception {
            PdfMetadataService service = nonProService(null);
            PdfMetadata md = PdfMetadata.builder().build();

            try (PDDocument doc = new PDDocument()) {
                service.setMetadataToPdf(doc, md, true);

                PDDocumentInformation info = doc.getDocumentInformation();
                assertEquals(LABEL, info.getProducer());
                assertNull(info.getTitle());
                assertNull(info.getSubject());
                assertNull(info.getKeywords());
                assertNull(info.getAuthor());
                // newlyCreated=true always stamps a creation date.
                assertNotNull(info.getCreationDate());
                assertNotNull(info.getModificationDate());
            }
        }
    }

    @Nested
    @DisplayName("setMetadataToPdf (pro path with custom metadata)")
    class SetMetadataProTests {

        private ApplicationProperties propsWithCustomMetadata(
                boolean autoUpdate, String author, String creator) {
            ApplicationProperties props = mock(ApplicationProperties.class);
            Premium premium = mock(Premium.class);
            ProFeatures proFeatures = mock(ProFeatures.class);
            CustomMetadata customMetadata = mock(CustomMetadata.class);

            lenient().when(props.getPremium()).thenReturn(premium);
            lenient().when(premium.getProFeatures()).thenReturn(proFeatures);
            lenient().when(proFeatures.getCustomMetadata()).thenReturn(customMetadata);
            lenient().when(customMetadata.isAutoUpdateMetadata()).thenReturn(autoUpdate);
            lenient().when(customMetadata.getAuthor()).thenReturn(author);
            lenient().when(customMetadata.getCreator()).thenReturn(creator);
            return props;
        }

        @Test
        @DisplayName("uses custom author and creator when pro and auto-update enabled")
        void appliesCustomAuthorAndCreator() throws Exception {
            ApplicationProperties props =
                    propsWithCustomMetadata(true, "Custom Author", "Custom Creator");
            PdfMetadataService service = new PdfMetadataService(props, LABEL, true, null);

            PdfMetadata md = PdfMetadata.builder().author("Ignored").title("T").build();

            try (PDDocument doc = new PDDocument()) {
                service.setMetadataToPdf(doc, md, true);

                PDDocumentInformation info = doc.getDocumentInformation();
                assertEquals("Custom Author", info.getAuthor());
                assertEquals("Custom Creator", info.getCreator());
                // Producer is set to the label by both setNewDocumentMetadata and
                // setCommonMetadata.
                assertEquals(LABEL, info.getProducer());
            }
        }

        @Test
        @DisplayName("replaces 'username' token with the current user when userService present")
        void replacesUsernameToken() throws Exception {
            ApplicationProperties props =
                    propsWithCustomMetadata(true, "Report by username", "Creator");
            UserServiceInterface userService = mock(UserServiceInterface.class);
            when(userService.getCurrentUsername()).thenReturn("alice");

            PdfMetadataService service = new PdfMetadataService(props, LABEL, true, userService);
            PdfMetadata md = PdfMetadata.builder().title("T").build();

            try (PDDocument doc = new PDDocument()) {
                service.setMetadataToPdf(doc, md, true);

                assertEquals("Report by alice", doc.getDocumentInformation().getAuthor());
            }
        }

        @Test
        @DisplayName("leaves 'username' token intact when current user is null")
        void keepsTokenWhenUsernameNull() throws Exception {
            ApplicationProperties props =
                    propsWithCustomMetadata(true, "Report by username", "Creator");
            UserServiceInterface userService = mock(UserServiceInterface.class);
            when(userService.getCurrentUsername()).thenReturn(null);

            PdfMetadataService service = new PdfMetadataService(props, LABEL, true, userService);
            PdfMetadata md = PdfMetadata.builder().title("T").build();

            try (PDDocument doc = new PDDocument()) {
                service.setMetadataToPdf(doc, md, true);

                assertEquals("Report by username", doc.getDocumentInformation().getAuthor());
            }
        }

        @Test
        @DisplayName("custom author applied even without a userService")
        void appliesCustomAuthorWithoutUserService() throws Exception {
            ApplicationProperties props = propsWithCustomMetadata(true, "Static Author", "Creator");
            PdfMetadataService service = new PdfMetadataService(props, LABEL, true, null);
            PdfMetadata md = PdfMetadata.builder().title("T").build();

            try (PDDocument doc = new PDDocument()) {
                service.setMetadataToPdf(doc, md, true);

                assertEquals("Static Author", doc.getDocumentInformation().getAuthor());
            }
        }

        @Test
        @DisplayName("pro flag without auto-update keeps metadata author and label creator")
        void proButAutoUpdateDisabledUsesMetadata() throws Exception {
            ApplicationProperties props =
                    propsWithCustomMetadata(false, "Custom Author", "Custom Creator");
            PdfMetadataService service = new PdfMetadataService(props, LABEL, true, null);
            PdfMetadata md = PdfMetadata.builder().author("Metadata Author").title("T").build();

            try (PDDocument doc = new PDDocument()) {
                service.setMetadataToPdf(doc, md, true);

                PDDocumentInformation info = doc.getDocumentInformation();
                assertEquals("Metadata Author", info.getAuthor());
                assertEquals(LABEL, info.getCreator());
            }
        }

        @Test
        @DisplayName("auto-update enabled but not pro keeps metadata author and label creator")
        void autoUpdateButNotProUsesMetadata() throws Exception {
            ApplicationProperties props =
                    propsWithCustomMetadata(true, "Custom Author", "Custom Creator");
            PdfMetadataService service = new PdfMetadataService(props, LABEL, false, null);
            PdfMetadata md = PdfMetadata.builder().author("Metadata Author").title("T").build();

            try (PDDocument doc = new PDDocument()) {
                service.setMetadataToPdf(doc, md, true);

                PDDocumentInformation info = doc.getDocumentInformation();
                assertEquals("Metadata Author", info.getAuthor());
                assertEquals(LABEL, info.getCreator());
            }
        }
    }
}
