package stirling.software.SPDF.service;

import java.util.Calendar;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import stirling.software.SPDF.controller.api.pipeline.UserServiceInterface;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.PdfMetadata;

@Service
public class PdfMetadataService {

    private final ApplicationProperties applicationProperties;
    private final String stirlingPDFLabel;
    private final UserServiceInterface userService;

    @Autowired
    public PdfMetadataService(
            ApplicationProperties applicationProperties,
            @Qualifier("StirlingPDFLabel") String stirlingPDFLabel,
            @Autowired(required = false) UserServiceInterface userService) {
        this.applicationProperties = applicationProperties;
        this.stirlingPDFLabel = stirlingPDFLabel;
        this.userService = userService;
    }

    public PdfMetadata extractMetadataFromPdf(PDDocument pdf) {
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

    private void setNewDocumentMetadata(PDDocument pdf, PdfMetadata pdfMetadata) {

        String creator = stirlingPDFLabel;

        if (applicationProperties
                .getEnterpriseEdition()
                .getCustomMetadata()
                .isAutoUpdateMetadata()) {

            creator = applicationProperties.getEnterpriseEdition().getCustomMetadata().getCreator();
            pdf.getDocumentInformation().setProducer(stirlingPDFLabel);
        }

        pdf.getDocumentInformation().setCreator(creator);
        pdf.getDocumentInformation().setCreationDate(Calendar.getInstance());
    }

    private void setCommonMetadata(PDDocument pdf, PdfMetadata pdfMetadata) {
        String title = pdfMetadata.getTitle();
        pdf.getDocumentInformation().setTitle(title);
        pdf.getDocumentInformation().setProducer(stirlingPDFLabel);
        pdf.getDocumentInformation().setSubject(pdfMetadata.getSubject());
        pdf.getDocumentInformation().setKeywords(pdfMetadata.getKeywords());
        pdf.getDocumentInformation().setModificationDate(Calendar.getInstance());

        String author = pdfMetadata.getAuthor();
        if (applicationProperties
                .getEnterpriseEdition()
                .getCustomMetadata()
                .isAutoUpdateMetadata()) {
            author = applicationProperties.getEnterpriseEdition().getCustomMetadata().getAuthor();

            if (userService != null) {
                author = author.replace("username", userService.getCurrentUsername());
            }
        }
        pdf.getDocumentInformation().setAuthor(author);
    }
}
