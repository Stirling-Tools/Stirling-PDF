package stirling.software.SPDF.config;

import java.util.Calendar;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import stirling.software.SPDF.controller.api.pipeline.UserServiceInterface;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.PdfMetadata;

@Service
public class PdfMetadataService {

    private static PdfMetadataService instance;

    private final ApplicationProperties applicationProperties;
    private final String appVersion;
    private final UserServiceInterface userService;

    @Autowired
    public PdfMetadataService(
            ApplicationProperties applicationProperties,
            @Qualifier("appVersion") String appVersion,
            @Autowired(required = false) UserServiceInterface userService) {
        this.applicationProperties = applicationProperties;
        this.appVersion = appVersion;
        this.userService = userService;
    }

    @PostConstruct
    public void init() {
        instance = this;
    }

    // Static methods for easy access

    public static PdfMetadata extractMetadataFromPdf(PDDocument pdf) {
        return instance.extractMetadataFromPdfInstance(pdf);
    }

    public static void setDefaultMetadata(PDDocument pdf) {
        instance.setDefaultMetadataInstance(pdf);
    }

    public static void setMetadataToPdf(PDDocument pdf, PdfMetadata pdfMetadata) {
        instance.setMetadataToPdfInstance(pdf, pdfMetadata);
    }

    public static void setMetadataToPdf(
            PDDocument pdf, PdfMetadata pdfMetadata, boolean newlyCreated) {
        instance.setMetadataToPdfInstance(pdf, pdfMetadata, newlyCreated);
    }

    // Instance methods

    private PdfMetadata extractMetadataFromPdfInstance(PDDocument pdf) {
        return PdfMetadata.builder()
                .author(pdf.getDocumentInformation().getAuthor())
                .producer(pdf.getDocumentInformation().getProducer())
                .title(pdf.getDocumentInformation().getTitle())
                .creator(pdf.getDocumentInformation().getCreator())
                .subject(pdf.getDocumentInformation().getSubject())
                .keywords(pdf.getDocumentInformation().getKeywords())
                .creationDate(pdf.getDocumentInformation().getCreationDate())
                .modificationDate(pdf.getDocumentInformation().getModificationDate())
                .build();
    }

    private void setDefaultMetadataInstance(PDDocument pdf) {
        PdfMetadata metadata = extractMetadataFromPdfInstance(pdf);
        setMetadataToPdfInstance(pdf, metadata);
    }

    private void setMetadataToPdfInstance(PDDocument pdf, PdfMetadata pdfMetadata) {
        setMetadataToPdfInstance(pdf, pdfMetadata, true);
    }

    private void setMetadataToPdfInstance(
            PDDocument pdf, PdfMetadata pdfMetadata, boolean newlyCreated) {
        if (newlyCreated || pdfMetadata.getCreationDate() == null) {
            setNewDocumentMetadata(pdf, pdfMetadata);
        }
        setCommonMetadata(pdf, pdfMetadata);
    }

    private void setNewDocumentMetadata(PDDocument pdf, PdfMetadata pdfMetadata) {
        String producer = "Stirling-PDF";
        String title = pdfMetadata.getTitle();
        String creator = "Stirling-PDF";

        if (applicationProperties
                .getEnterpriseEdition()
                .getCustomMetadata()
                .isAutoUpdateMetadata()) {

            //producer =
            //        applicationProperties.getEnterpriseEdition().getCustomMetadata().getProducer();
            //creator = applicationProperties.getEnterpriseEdition().getCustomMetadata().getCreator();
            //title = applicationProperties.getEnterpriseEdition().getCustomMetadata().getTitle();

            if ("{filename}".equals(title)) {
                title = "Filename"; // Replace with actual filename logic
            } else if ("{unchanged}".equals(title)) {
                title = pdfMetadata.getTitle(); // Keep the original title
            }
        }

        pdf.getDocumentInformation().setProducer(producer + " " + appVersion);
        pdf.getDocumentInformation().setTitle(title);
        pdf.getDocumentInformation().setCreator(creator + " " + appVersion);
        pdf.getDocumentInformation().setCreationDate(Calendar.getInstance());
    }

    private void setCommonMetadata(PDDocument pdf, PdfMetadata pdfMetadata) {
        pdf.getDocumentInformation().setSubject(pdfMetadata.getSubject());
        pdf.getDocumentInformation().setKeywords(pdfMetadata.getKeywords());
        pdf.getDocumentInformation().setModificationDate(Calendar.getInstance());

        String author = pdfMetadata.getAuthor();
        //if (applicationProperties
        //        .getEnterpriseEdition()
        //        .getCustomMetadata()
        //        .isAutoUpdateMetadata()) {
        //    author = applicationProperties.getEnterpriseEdition().getCustomMetadata().getAuthor();

            //if (userService != null) {
            //    author = author.replace("username", userService.getCurrentUsername());
            //}
        //}
        pdf.getDocumentInformation().setAuthor(author);
    }
}
