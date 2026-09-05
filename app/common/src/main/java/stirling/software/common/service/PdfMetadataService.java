package stirling.software.common.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.util.DateConverter;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.AdobePDFSchema;
import org.apache.xmpbox.schema.DublinCoreSchema;
import org.apache.xmpbox.schema.XMPBasicSchema;
import org.apache.xmpbox.schema.XMPMediaManagementSchema;
import org.apache.xmpbox.schema.XMPSchema;
import org.apache.xmpbox.type.AbstractField;
import org.apache.xmpbox.xml.DomXmpParser;
import org.apache.xmpbox.xml.XmpParsingException;
import org.apache.xmpbox.xml.XmpSerializer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.PdfMetadata;

@Slf4j
@Service
public class PdfMetadataService {

    public static final String CLASSIFICATION_KEY = "StirlingPDFClassification";

    public static final String PDFX_NAMESPACE = "http://ns.adobe.com/pdfx/1.3/";

    private static final Pattern ILLEGAL_XML_NAME_CHARS = Pattern.compile("[^A-Za-z0-9._-]");

    private static final List<DateTimeFormatter> DATE_TIME_FORMATTERS =
            List.of(
                    DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss"),
                    DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm"),
                    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
                    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"),
                    DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"),
                    DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS"),
                    DateTimeFormatter.ofPattern("d.M.yyyy HH:mm:ss"),
                    DateTimeFormatter.ofPattern("d.M.yyyy HH:mm"),
                    DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss"),
                    DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"),
                    DateTimeFormatter.ofPattern("d/M/yyyy HH:mm:ss"),
                    DateTimeFormatter.ofPattern("d/M/yyyy HH:mm"),
                    DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss"),
                    DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"),
                    DateTimeFormatter.ofPattern("M/d/yyyy HH:mm:ss"),
                    DateTimeFormatter.ofPattern("M/d/yyyy HH:mm"),
                    DateTimeFormatter.ofPattern("MM/dd/yyyy HH:mm:ss"),
                    DateTimeFormatter.ofPattern("MM/dd/yyyy HH:mm"));

    private static final List<DateTimeFormatter> DATE_ONLY_FORMATTERS =
            List.of(
                    DateTimeFormatter.ofPattern("yyyy/MM/dd"),
                    DateTimeFormatter.ofPattern("yyyy-MM-dd"),
                    DateTimeFormatter.ofPattern("d.M.yyyy"),
                    DateTimeFormatter.ofPattern("dd.MM.yyyy"),
                    DateTimeFormatter.ofPattern("d/M/yyyy"),
                    DateTimeFormatter.ofPattern("dd/MM/yyyy"),
                    DateTimeFormatter.ofPattern("M/d/yyyy"),
                    DateTimeFormatter.ofPattern("MM/dd/yyyy"));

    private final ApplicationProperties applicationProperties;
    private final String stirlingPDFLabel;
    private final UserServiceInterface userService;
    private final boolean runningProOrHigher;

    public PdfMetadataService(
            ApplicationProperties applicationProperties,
            @Qualifier("StirlingPDFLabel") String stirlingPDFLabel,
            @Qualifier("runningProOrHigher") boolean runningProOrHigher,
            @Autowired(required = false) UserServiceInterface userService) {
        this.applicationProperties = applicationProperties;
        this.stirlingPDFLabel = stirlingPDFLabel;
        this.userService = userService;
        this.runningProOrHigher = runningProOrHigher;
    }

    /**
     * Converts a {@link ZonedDateTime} to a {@link Calendar} for PDFBox compatibility.
     *
     * @param zonedDateTime the date-time to convert, or null
     * @return Calendar representation, or null if input is null
     */
    public static Calendar toCalendar(ZonedDateTime zonedDateTime) {
        if (zonedDateTime == null) {
            return null;
        }
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(zonedDateTime.toInstant().toEpochMilli());
        return calendar;
    }

    public void setDefaultMetadata(PDDocument pdf) {
        PdfMetadata metadata = extractMetadataFromPdf(pdf);
        setMetadataToPdf(pdf, metadata);
    }

    public void setMetadataToPdf(PDDocument pdf, PdfMetadata pdfMetadata) {
        setMetadataToPdf(pdf, pdfMetadata, false);
    }

    public void setMetadataToPdf(PDDocument pdf, PdfMetadata pdfMetadata, boolean newlyCreated) {
        if (newlyCreated || pdfMetadata.getCreationDate() == null) {
            setNewDocumentMetadata(pdf, pdfMetadata);
        }
        setCommonMetadata(pdf, pdfMetadata);
    }

    /**
     * Parses a date string into a {@link Calendar} supporting ISO-8601, PDF internal date format
     * ("D:YYYYMMDD..."), and common localized date and date-time patterns.
     *
     * @param dateString raw date string
     * @return parsed Calendar, or null if input is null, blank, or cannot be parsed
     */
    public static Calendar parseToCalendar(String dateString) {
        if (dateString == null) {
            return null;
        }
        String trimmed = dateString.trim();
        if (trimmed.isEmpty()) {
            return null;
        }

        if (trimmed.startsWith("D:")) {
            Calendar cal = DateConverter.toCalendar(trimmed);
            if (cal != null) {
                return cal;
            }
        }

        try {
            return toCalendar(ZonedDateTime.parse(trimmed));
        } catch (DateTimeParseException ignored) {
        }
        try {
            return toCalendar(OffsetDateTime.parse(trimmed).toZonedDateTime());
        } catch (DateTimeParseException ignored) {
        }
        try {
            return toCalendar(Instant.parse(trimmed).atZone(ZoneId.systemDefault()));
        } catch (DateTimeParseException ignored) {
        }

        for (DateTimeFormatter dtf : DATE_TIME_FORMATTERS) {
            try {
                LocalDateTime ldt = LocalDateTime.parse(trimmed, dtf);
                return toCalendar(ldt.atZone(ZoneId.systemDefault()));
            } catch (DateTimeParseException ignored) {
            }
        }

        for (DateTimeFormatter df : DATE_ONLY_FORMATTERS) {
            try {
                LocalDate ld = LocalDate.parse(trimmed, df);
                return toCalendar(ld.atStartOfDay(ZoneId.systemDefault()));
            } catch (DateTimeParseException ignored) {
            }
        }

        if (!trimmed.startsWith("D:")) {
            Calendar cal = DateConverter.toCalendar(trimmed);
            if (cal != null) {
                return cal;
            }
        }

        log.debug("Unparseable date string: '{}'", trimmed);
        return null;
    }

    public PdfMetadata extractMetadataFromPdf(PDDocument pdf) {
        Calendar creationCal = pdf.getDocumentInformation().getCreationDate();
        Calendar modificationCal = pdf.getDocumentInformation().getModificationDate();

        ZonedDateTime creationDate =
                creationCal != null
                        ? ZonedDateTime.ofInstant(creationCal.toInstant(), ZoneId.systemDefault())
                        : null;
        ZonedDateTime modificationDate =
                modificationCal != null
                        ? ZonedDateTime.ofInstant(
                                modificationCal.toInstant(), ZoneId.systemDefault())
                        : null;

        return PdfMetadata.builder()
                .author(pdf.getDocumentInformation().getAuthor())
                .producer(pdf.getDocumentInformation().getProducer())
                .title(pdf.getDocumentInformation().getTitle())
                .creator(pdf.getDocumentInformation().getCreator())
                .subject(pdf.getDocumentInformation().getSubject())
                .keywords(pdf.getDocumentInformation().getKeywords())
                .creationDate(creationDate)
                .modificationDate(modificationDate)
                .build();
    }

    private void setNewDocumentMetadata(PDDocument pdf, PdfMetadata pdfMetadata) {

        String creator = stirlingPDFLabel;

        if (applicationProperties
                        .getPremium()
                        .getProFeatures()
                        .getCustomMetadata()
                        .isAutoUpdateMetadata()
                && runningProOrHigher) {

            creator =
                    applicationProperties
                            .getPremium()
                            .getProFeatures()
                            .getCustomMetadata()
                            .getCreator();
            pdf.getDocumentInformation().setProducer(stirlingPDFLabel);
        }

        pdf.getDocumentInformation().setCreator(creator);

        Calendar creationCal =
                pdfMetadata.getCreationDate() != null
                        ? toCalendar(pdfMetadata.getCreationDate())
                        : Calendar.getInstance();
        pdf.getDocumentInformation().setCreationDate(creationCal);
    }

    private void setCommonMetadata(PDDocument pdf, PdfMetadata pdfMetadata) {
        String title = pdfMetadata.getTitle();
        pdf.getDocumentInformation().setTitle(title);
        pdf.getDocumentInformation().setProducer(stirlingPDFLabel);
        pdf.getDocumentInformation().setSubject(pdfMetadata.getSubject());
        pdf.getDocumentInformation().setKeywords(pdfMetadata.getKeywords());

        Calendar modificationCal =
                pdfMetadata.getModificationDate() != null
                        ? toCalendar(pdfMetadata.getModificationDate())
                        : Calendar.getInstance();
        pdf.getDocumentInformation().setModificationDate(modificationCal);

        String author = pdfMetadata.getAuthor();
        if (applicationProperties
                        .getPremium()
                        .getProFeatures()
                        .getCustomMetadata()
                        .isAutoUpdateMetadata()
                && runningProOrHigher) {
            author =
                    applicationProperties
                            .getPremium()
                            .getProFeatures()
                            .getCustomMetadata()
                            .getAuthor();

            if (userService != null) {
                String username = userService.getCurrentUsername();
                if (username != null) {
                    author = author.replace("username", username);
                }
            }
        }
        pdf.getDocumentInformation().setAuthor(author);
    }

    /**
     * Writes document classification JSON into the custom Info-dictionary field {@link
     * #CLASSIFICATION_KEY}.
     *
     * @param pdf document to update
     * @param classificationJson classifier result JSON
     */
    public void setClassificationMetadata(PDDocument pdf, String classificationJson) {
        PDDocumentInformation info = pdf.getDocumentInformation();
        info.setCustomMetadataValue(CLASSIFICATION_KEY, classificationJson);
        pdf.setDocumentInformation(info);
    }

    /**
     * Synchronizes standard metadata fields and custom metadata from {@link PDDocumentInformation}
     * into the document catalog's XMP metadata stream (/Catalog /Metadata).
     *
     * <p>Windows Explorer, Adobe Acrobat, and PDF/A validators prioritize the XMP stream over the
     * legacy /Info dictionary (ISO 32000-1 §14.3.3). This method synchronizes Dublin Core, XMP
     * Basic, Adobe PDF, XMP Media Management (updating InstanceID), and custom metadata (stored in
     * the {@value #PDFX_NAMESPACE} schema following Adobe Acrobat convention).
     *
     * @param document the PDF document to synchronize
     * @param customMetadata custom metadata key-value pairs (or null if custom metadata should not
     *     be modified)
     * @throws IOException if XMP serialization or parsing fails
     */
    public void synchronizeXmpMetadata(PDDocument document, Map<String, String> customMetadata)
            throws IOException {
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        if (catalog == null) {
            return;
        }
        PDDocumentInformation info = document.getDocumentInformation();
        if (info == null) {
            info = new PDDocumentInformation();
            document.setDocumentInformation(info);
        }

        PDMetadata existingPdMetadata = catalog.getMetadata();
        XMPMetadata xmp = null;
        if (existingPdMetadata != null) {
            try (InputStream is = existingPdMetadata.createInputStream()) {
                DomXmpParser parser = new DomXmpParser();
                parser.setStrictParsing(false);
                xmp = parser.parse(is);
            } catch (XmpParsingException e) {
                log.debug(
                        "Failed to parse existing XMP metadata, initializing fresh XMP: {}",
                        e.getMessage());
            }
        }
        if (xmp == null) {
            xmp = XMPMetadata.createXMPMetadata();
        }

        DublinCoreSchema dc = xmp.getDublinCoreSchema();
        if (dc == null) {
            dc = xmp.createAndAddDublinCoreSchema();
        }
        String title = info.getTitle();
        AbstractField tp = dc.getProperty("title");
        if (tp != null) {
            dc.removeProperty(tp);
        }
        if (title != null && !title.isBlank()) {
            dc.setTitle(title);
        }

        String author = info.getAuthor();
        List<String> existingCreators = dc.getCreators();
        if (existingCreators != null) {
            for (String c : List.copyOf(existingCreators)) {
                dc.removeCreator(c);
            }
        }
        if (author != null && !author.isBlank()) {
            dc.addCreator(author);
        }

        String subject = info.getSubject();
        AbstractField descProp = dc.getProperty("description");
        if (descProp != null) {
            dc.removeProperty(descProp);
        }
        if (subject != null && !subject.isBlank()) {
            dc.setDescription(subject);
        }

        String keywords = info.getKeywords();
        List<String> existingSubjects = dc.getSubjects();
        if (existingSubjects != null) {
            for (String s : List.copyOf(existingSubjects)) {
                dc.removeSubject(s);
            }
        }
        if (keywords != null && !keywords.isBlank()) {
            for (String kw : keywords.split("[,;]")) {
                String trimmed = kw.trim();
                if (!trimmed.isEmpty()) {
                    dc.addSubject(trimmed);
                }
            }
        }

        XMPBasicSchema basic = xmp.getXMPBasicSchema();
        if (basic == null) {
            basic = xmp.createAndAddXMPBasicSchema();
        }
        Calendar creationDate = info.getCreationDate();
        if (creationDate != null) {
            basic.setCreateDate(creationDate);
        } else {
            AbstractField cd = basic.getProperty("CreateDate");
            if (cd != null) {
                basic.removeProperty(cd);
            }
        }

        Calendar modificationDate = info.getModificationDate();
        if (modificationDate != null) {
            basic.setModifyDate(modificationDate);
        } else {
            AbstractField md = basic.getProperty("ModifyDate");
            if (md != null) {
                basic.removeProperty(md);
            }
        }
        // MetadataDate records when the metadata itself was last modified per ISO 16684-1
        basic.setMetadataDate(Calendar.getInstance());

        String creator = info.getCreator();
        if (creator != null && !creator.isBlank()) {
            basic.setCreatorTool(creator);
        } else {
            AbstractField ct = basic.getProperty("CreatorTool");
            if (ct != null) {
                basic.removeProperty(ct);
            }
        }

        XMPMediaManagementSchema mm = xmp.getXMPMediaManagementSchema();
        if (mm == null) {
            mm = xmp.createAndAddXMPMediaManagementSchema();
        }
        if (mm.getDocumentID() == null) {
            mm.setDocumentID("uuid:" + UUID.randomUUID());
        }
        mm.setInstanceID("uuid:" + UUID.randomUUID());

        AdobePDFSchema adobePdf = xmp.getAdobePDFSchema();
        if (adobePdf == null) {
            adobePdf = xmp.createAndAddAdobePDFSchema();
        }
        String producer = info.getProducer();
        if (producer != null && !producer.isBlank()) {
            adobePdf.setProducer(producer);
        } else {
            AbstractField p = adobePdf.getProperty("Producer");
            if (p != null) {
                adobePdf.removeProperty(p);
            }
        }
        if (keywords != null && !keywords.isBlank()) {
            adobePdf.setKeywords(keywords);
        } else {
            AbstractField k = adobePdf.getProperty("Keywords");
            if (k != null) {
                adobePdf.removeProperty(k);
            }
        }

        String trapped = info.getTrapped();
        String normalizedTrapped = null;
        if ("true".equalsIgnoreCase(trapped)) {
            normalizedTrapped = "True";
        } else if ("false".equalsIgnoreCase(trapped)) {
            normalizedTrapped = "False";
        }
        if (normalizedTrapped != null) {
            adobePdf.setTextPropertyValueAsSimple("Trapped", normalizedTrapped);
        } else {
            AbstractField t = adobePdf.getProperty("Trapped");
            if (t != null) {
                adobePdf.removeProperty(t);
            }
        }

        // Adobe Acrobat convention places custom document properties into
        // http://ns.adobe.com/pdfx/1.3/
        if (customMetadata != null) {
            XMPSchema pdfx = xmp.getSchema(PDFX_NAMESPACE);
            if (pdfx == null && !customMetadata.isEmpty()) {
                pdfx = new XMPSchema(xmp, PDFX_NAMESPACE, "pdfx");
                xmp.addSchema(pdfx);
            }
            if (pdfx != null) {
                // Remove deleted custom properties, preserving standard PDF/X properties (e.g.
                // GTS_PDFXVersion)
                for (AbstractField prop : List.copyOf(pdfx.getAllProperties())) {
                    String propName = prop.getPropertyName();
                    if (propName != null && !propName.startsWith("GTS_")) {
                        boolean retained =
                                customMetadata.keySet().stream()
                                        .anyMatch(
                                                k ->
                                                        sanitizeXmlPropertyName(k.trim())
                                                                .equalsIgnoreCase(propName));
                        if (!retained) {
                            pdfx.removeProperty(prop);
                        }
                    }
                }
                for (Map.Entry<String, String> entry : customMetadata.entrySet()) {
                    String rawKey = entry.getKey();
                    String val = entry.getValue();
                    if (rawKey != null && !rawKey.trim().isEmpty() && val != null) {
                        String cleanKey = sanitizeXmlPropertyName(rawKey.trim());
                        pdfx.setTextPropertyValueAsSimple(cleanKey, val);
                    }
                }
            }
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try {
            // withXpacket = true writes the <?xpacket ... ?> processing instructions required by
            // ISO 32000-1 §14.3.2
            new XmpSerializer().serialize(xmp, baos, true);
        } catch (Exception e) {
            throw new IOException("Failed to serialize XMP metadata", e);
        }
        PDMetadata pdMetadata = new PDMetadata(document);
        pdMetadata.importXMPMetadata(baos.toByteArray());
        catalog.setMetadata(pdMetadata);
    }

    private static String sanitizeXmlPropertyName(String key) {
        String cleaned = ILLEGAL_XML_NAME_CHARS.matcher(key).replaceAll("_");
        if (cleaned.isEmpty()
                || (!Character.isLetter(cleaned.charAt(0)) && cleaned.charAt(0) != '_')) {
            cleaned = "_" + cleaned;
        }
        if (cleaned.toLowerCase(Locale.ROOT).startsWith("xml")) {
            cleaned = "_" + cleaned;
        }
        return cleaned;
    }
}
