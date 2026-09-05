package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Calendar;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.AdobePDFSchema;
import org.apache.xmpbox.schema.DublinCoreSchema;
import org.apache.xmpbox.schema.XMPBasicSchema;
import org.apache.xmpbox.schema.XMPSchema;
import org.apache.xmpbox.xml.DomXmpParser;
import org.apache.xmpbox.xml.XmpSerializer;
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
            assertNull(PdfMetadataService.parseToCalendar("abcd-ef-gh"));
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

        @Test
        @DisplayName("parses diverse date formats including 1.1.2025 and ISO")
        void parsesDiverseDateFormats() {
            Calendar dotCal = PdfMetadataService.parseToCalendar("1.1.2025");
            assertNotNull(dotCal);
            long expectedDot =
                    LocalDate.of(2025, 1, 1)
                            .atStartOfDay(ZoneId.systemDefault())
                            .toInstant()
                            .toEpochMilli();
            assertEquals(expectedDot, dotCal.getTimeInMillis());

            Calendar dashCal = PdfMetadataService.parseToCalendar("2021-06-15");
            assertNotNull(dashCal);
            long expectedDash =
                    LocalDate.of(2021, 6, 15)
                            .atStartOfDay(ZoneId.systemDefault())
                            .toInstant()
                            .toEpochMilli();
            assertEquals(expectedDash, dashCal.getTimeInMillis());

            Calendar slashCal = PdfMetadataService.parseToCalendar("2025/01/01");
            assertNotNull(slashCal);
            long expectedSlash =
                    LocalDate.of(2025, 1, 1)
                            .atStartOfDay(ZoneId.systemDefault())
                            .toInstant()
                            .toEpochMilli();
            assertEquals(expectedSlash, slashCal.getTimeInMillis());

            Calendar dashTimeCal = PdfMetadataService.parseToCalendar("2025-01-01 14:30:00");
            assertNotNull(dashTimeCal);
            long expectedDashTime =
                    LocalDateTime.of(2025, 1, 1, 14, 30, 0)
                            .atZone(ZoneId.systemDefault())
                            .toInstant()
                            .toEpochMilli();
            assertEquals(expectedDashTime, dashTimeCal.getTimeInMillis());

            Calendar isoCal = PdfMetadataService.parseToCalendar("2025-01-01T12:00:00Z");
            assertNotNull(isoCal);
            assertEquals(
                    Instant.parse("2025-01-01T12:00:00Z").toEpochMilli(), isoCal.getTimeInMillis());

            Calendar pdfCal = PdfMetadataService.parseToCalendar("D:20250101120000");
            assertNotNull(pdfCal);
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

    @Nested
    @DisplayName("synchronizeXmpMetadata(PDDocument, Map)")
    class SynchronizeXmpMetadataTests {

        @Test
        @DisplayName("synchronizes all standard and custom fields to XMP stream")
        void synchronizesStandardAndCustomFields() throws Exception {
            PdfMetadataService service = nonProService(null);
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());
                PDDocumentInformation info = doc.getDocumentInformation();
                info.setTitle("XMP Test Title");
                info.setAuthor("XMP Test Author");
                info.setSubject("XMP Test Subject");
                info.setKeywords("tag1, tag2, tag3");
                info.setCreator("XMP Test Creator");
                info.setProducer("XMP Test Producer");
                info.setTrapped("True");

                Calendar creation = Calendar.getInstance();
                creation.setTimeInMillis(1_700_000_000_000L);
                Calendar modification = Calendar.getInstance();
                modification.setTimeInMillis(1_710_000_000_000L);
                info.setCreationDate(creation);
                info.setModificationDate(modification);

                Map<String, String> customMetadata =
                        Map.of(
                                "Department", "Engineering",
                                "Project-Code", "Apollo-11");

                service.synchronizeXmpMetadata(doc, customMetadata);

                PDMetadata pdMetadata = doc.getDocumentCatalog().getMetadata();
                assertNotNull(pdMetadata);

                DomXmpParser parser = new DomXmpParser();
                parser.setStrictParsing(false);
                XMPMetadata xmp = parser.parse(new ByteArrayInputStream(pdMetadata.toByteArray()));
                assertNotNull(xmp);

                DublinCoreSchema dc = xmp.getDublinCoreSchema();
                assertNotNull(dc);
                assertEquals("XMP Test Title", dc.getTitle());
                assertNotNull(dc.getCreators());
                assertEquals("XMP Test Author", dc.getCreators().get(0));
                assertEquals("XMP Test Subject", dc.getDescription());
                assertNotNull(dc.getSubjects());
                assertEquals(3, dc.getSubjects().size());

                XMPBasicSchema basic = xmp.getXMPBasicSchema();
                assertNotNull(basic);
                assertEquals("XMP Test Creator", basic.getCreatorTool());
                assertNotNull(basic.getCreateDate());
                assertEquals(1_700_000_000_000L, basic.getCreateDate().getTimeInMillis());
                assertNotNull(basic.getModifyDate());
                assertEquals(1_710_000_000_000L, basic.getModifyDate().getTimeInMillis());

                AdobePDFSchema pdfSchema = xmp.getAdobePDFSchema();
                assertNotNull(pdfSchema);
                assertEquals("XMP Test Producer", pdfSchema.getProducer());
                assertEquals("tag1, tag2, tag3", pdfSchema.getKeywords());

                XMPSchema pdfx = xmp.getSchema(PdfMetadataService.PDFX_NAMESPACE);
                assertNotNull(pdfx);
                assertEquals("Engineering", pdfx.getUnqualifiedTextPropertyValue("Department"));
                assertEquals("Apollo-11", pdfx.getUnqualifiedTextPropertyValue("Project-Code"));
            }
        }

        @Test
        @DisplayName("removes deleted custom fields on subsequent synchronization")
        void removesDeletedCustomFields() throws Exception {
            PdfMetadataService service = nonProService(null);
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());

                service.synchronizeXmpMetadata(doc, Map.of("Field1", "Val1", "Field2", "Val2"));
                service.synchronizeXmpMetadata(doc, Map.of("Field2", "Val2Updated"));

                PDMetadata pdMetadata = doc.getDocumentCatalog().getMetadata();
                DomXmpParser parser = new DomXmpParser();
                parser.setStrictParsing(false);
                XMPMetadata xmp = parser.parse(new ByteArrayInputStream(pdMetadata.toByteArray()));

                XMPSchema pdfx = xmp.getSchema(PdfMetadataService.PDFX_NAMESPACE);
                assertNotNull(pdfx);
                assertNull(pdfx.getUnqualifiedTextPropertyValue("Field1"));
                assertEquals("Val2Updated", pdfx.getUnqualifiedTextPropertyValue("Field2"));
            }
        }

        @Test
        @DisplayName(
                "preserves standard PDF/X properties like GTS_PDFXVersion during custom metadata synchronization")
        void preservesStandardPdfXProperties() throws Exception {
            PdfMetadataService service = nonProService(null);
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());

                XMPMetadata initialXmp = XMPMetadata.createXMPMetadata();
                XMPSchema pdfxInitial =
                        new XMPSchema(initialXmp, PdfMetadataService.PDFX_NAMESPACE, "pdfx");
                pdfxInitial.setTextPropertyValueAsSimple("GTS_PDFXVersion", "PDF/X-1:2001");
                pdfxInitial.setTextPropertyValueAsSimple("OldCustom", "OldValue");
                initialXmp.addSchema(pdfxInitial);

                ByteArrayOutputStream xmpBaos = new ByteArrayOutputStream();
                new XmpSerializer().serialize(initialXmp, xmpBaos, true);
                PDMetadata pdMetadata = new PDMetadata(doc);
                pdMetadata.importXMPMetadata(xmpBaos.toByteArray());
                doc.getDocumentCatalog().setMetadata(pdMetadata);

                service.synchronizeXmpMetadata(doc, Map.of("NewCustom", "NewValue"));

                PDMetadata updatedMetadata = doc.getDocumentCatalog().getMetadata();
                DomXmpParser parser = new DomXmpParser();
                parser.setStrictParsing(false);
                XMPMetadata xmp =
                        parser.parse(new ByteArrayInputStream(updatedMetadata.toByteArray()));

                XMPSchema pdfx = xmp.getSchema(PdfMetadataService.PDFX_NAMESPACE);
                assertNotNull(pdfx);
                assertEquals(
                        "PDF/X-1:2001", pdfx.getUnqualifiedTextPropertyValue("GTS_PDFXVersion"));
                assertEquals("NewValue", pdfx.getUnqualifiedTextPropertyValue("NewCustom"));
                assertNull(pdfx.getUnqualifiedTextPropertyValue("OldCustom"));
            }
        }
    }
}
