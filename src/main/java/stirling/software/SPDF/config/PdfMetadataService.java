package stirling.software.SPDF.config;

import java.util.Calendar;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.PdfMetadata;

@Service
public class PdfMetadataService {

    private static ApplicationProperties applicationProperties;

    @Autowired private ApplicationProperties autowiredProperties;

    @PostConstruct
    private void init() {
        applicationProperties = autowiredProperties;
    }

    public static PdfMetadata extractMetadataFromPdf(PDDocument pdf) {
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

    private static void setMetadataToPdfCommon(PDDocument pdf, PdfMetadata pdfMetadata) {
        pdf.getDocumentInformation().setSubject(pdfMetadata.getSubject());
        pdf.getDocumentInformation().setKeywords(pdfMetadata.getKeywords());
        pdf.getDocumentInformation().setModificationDate(Calendar.getInstance());

        String author = pdfMetadata.getAuthor();
        if (applicationProperties != null
                && applicationProperties
                        .getEnterpriseEdition()
                        .getCustomMetadata()
                        .isAutoUpdateMetadata()) {
            author = applicationProperties.getEnterpriseEdition().getCustomMetadata().getAuthor();
            // You might want to replace {username} with the actual username here
            author =
                    author.replace(
                            "{username}", "CurrentUser"); // Replace with actual username logic
        }
        pdf.getDocumentInformation().setAuthor(author);
    }

    public static void setMetadataToPdf(PDDocument pdf, PdfMetadata pdfMetadata) {
        setMetadataToPdf(pdf, pdfMetadata, true);
    }

    public static void setMetadataToPdf(
            PDDocument pdf, PdfMetadata pdfMetadata, boolean newlyCreated) {
        if (newlyCreated) {
            String producer = pdfMetadata.getProducer();
            String title = pdfMetadata.getTitle();
            String creator = pdfMetadata.getCreator();
            if (applicationProperties != null
                    && applicationProperties
                            .getEnterpriseEdition()
                            .getCustomMetadata()
                            .isAutoUpdateMetadata()) {

                producer =
                        applicationProperties
                                .getEnterpriseEdition()
                                .getCustomMetadata()
                                .getProducer();
                creator =
                        applicationProperties
                                .getEnterpriseEdition()
                                .getCustomMetadata()
                                .getCreator();
                title = applicationProperties.getEnterpriseEdition().getCustomMetadata().getTitle();

                // Handle special cases for title
                if ("{filename}".equals(title)) {
                    title = "Filename"; // Replace with actual filename logic
                } else if ("{unchanged}".equals(title)) {
                    title = pdfMetadata.getTitle(); // Keep the original title
                }
            }

            pdf.getDocumentInformation().setProducer(producer);
            pdf.getDocumentInformation().setTitle(title);
            pdf.getDocumentInformation().setCreator(creator);
            pdf.getDocumentInformation().setCreationDate(pdfMetadata.getCreationDate());
        }
        setMetadataToPdfCommon(pdf, pdfMetadata);
    }
}
