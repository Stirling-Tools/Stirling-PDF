package stirling.software.SPDF.service;

import java.io.ByteArrayOutputStream;
import java.security.KeyStore;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.SPDF.controller.api.security.CertSignController;
import stirling.software.common.model.multipart.ByteArrayMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfSigningService;

/** Core implementation of {@link PdfSigningService} backed by {@link CertSignController}. */
@ApplicationScoped
public class PdfSigningServiceImpl implements PdfSigningService {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    public PdfSigningServiceImpl(CustomPDFDocumentFactory pdfDocumentFactory) {
        this.pdfDocumentFactory = pdfDocumentFactory;
    }

    @Override
    public byte[] signWithKeystore(
            byte[] pdfBytes,
            KeyStore keystore,
            char[] password,
            boolean showSignature,
            Integer pageNumber,
            String name,
            String location,
            String reason,
            boolean showLogo)
            throws Exception {

        CertSignController.CreateSignature createSignature =
                new CertSignController.CreateSignature(keystore, password);

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        ByteArrayMultipartFile inputFile =
                new ByteArrayMultipartFile("file", "document.pdf", "application/pdf", pdfBytes);

        CertSignController.sign(
                pdfDocumentFactory,
                inputFile,
                outputStream,
                createSignature,
                showSignature,
                pageNumber,
                name,
                location,
                reason,
                showLogo);

        return outputStream.toByteArray();
    }
}
