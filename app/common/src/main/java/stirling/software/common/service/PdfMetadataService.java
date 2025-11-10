package stirling.software.common.service;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Calendar;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.PdfMetadata;

@Service
public class PdfMetadataService {

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
     * Converts ZonedDateTime to Calendar for PDFBox compatibility.
     *
     * @param zonedDateTime the ZonedDateTime to convert
     * @return Calendar instance or null if input is null
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
     * Parses a date string and converts it to Calendar for PDFBox compatibility.
     *
     * @param dateString the date string in "yyyy/MM/dd HH:mm:ss" format
     * @return Calendar instance or null if parsing fails or input is empty
     */
    public static Calendar parseToCalendar(String dateString) {
        if (dateString == null || dateString.trim().isEmpty()) {
            return null;
        }
        try {
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss");
            ZonedDateTime zonedDateTime =
                    LocalDateTime.parse(dateString, formatter).atZone(ZoneId.systemDefault());
            return toCalendar(zonedDateTime);
        } catch (Exception e) {
            return null;
        }
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

        // Use existing creation date if available, otherwise create new one
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

        // Convert ZonedDateTime to Calendar for PDFBox compatibility
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
                author = author.replace("username", userService.getCurrentUsername());
            }
        }
        pdf.getDocumentInformation().setAuthor(author);
    }
}
