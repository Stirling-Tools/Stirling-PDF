package stirling.software.SPDF.service;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.config.PdfMetadataService;
import stirling.software.SPDF.model.PdfMetadata;
import stirling.software.SPDF.model.api.PDFFile;

@Component
public class CustomPDDocumentFactory {

    private static final Logger logger = LoggerFactory.getLogger(CustomPDDocumentFactory.class);

    private final PdfMetadataService pdfMetadataService;

    @Autowired
    public CustomPDDocumentFactory(PdfMetadataService pdfMetadataService) {
        this.pdfMetadataService = pdfMetadataService;
    }

    public PDDocument createNewDocument() throws IOException {
        PDDocument document = new PDDocument();
        pdfMetadataService.setMetadataToPdf(document, PdfMetadata.builder().build(), true);
        return document;
    }

    public PDDocument createNewDocumentBasedOnOldDocument(PDDocument oldDocument)
            throws IOException {
        PDDocument document = new PDDocument();
        pdfMetadataService.setMetadataToPdf(
                document, pdfMetadataService.extractMetadataFromPdf(oldDocument), true);
        return document;
    }

    public byte[] loadToBytes(File file) throws IOException {
        PDDocument document = load(file);
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        // Close the document
        document.close();
        return baos.toByteArray();
    }

    public byte[] loadToBytes(byte[] bytes) throws IOException {
        PDDocument document = load(bytes);
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        // Close the document
        document.close();
        return baos.toByteArray();
    }

    // if loading from a file, assume the file has been made with Stirling-PDF
    public PDDocument load(File file) throws IOException {
        PDDocument document = Loader.loadPDF(file);
        pdfMetadataService.setMetadataToPdf(document, PdfMetadata.builder().build(), true);
        return document;
    }

    public PDDocument load(InputStream input) throws IOException {
        return load(input.readAllBytes());
    }

    public PDDocument load(byte[] input) throws IOException {
        PDDocument document = Loader.loadPDF(input);
        pdfMetadataService.setDefaultMetadata(document);
        removezeropassword(document);
        return document;
    }

    public PDDocument load(PDFFile pdfFile) throws IOException {
        return load(pdfFile.getFileInput());
    }

    public PDDocument load(MultipartFile pdfFile) throws IOException {
        return load(pdfFile.getBytes());
    }

    public PDDocument load(String path) throws IOException {
        return load(new File(path));
    }

    public PDDocument load(MultipartFile fileInput, String password) throws IOException {
        return load(fileInput.getBytes(), password);
    }

    private PDDocument load(byte[] bytes, String password) throws IOException {
        PDDocument document = Loader.loadPDF(bytes, password);
        pdfMetadataService.setDefaultMetadata(document);
        return document;
    }

    private PDDocument removezeropassword(PDDocument document) throws IOException {
        if (document.isEncrypted()) {
            try {
                logger.info("Removing security from the source document");
                document.setAllSecurityToBeRemoved(true);
            } catch (Exception e) {
                logger.warn("Cannot decrypt the pdf");
            }
        }
        return document;
    }

    // Add other load methods as needed, following the same pattern
}
