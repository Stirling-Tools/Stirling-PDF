package stirling.software.SPDF.service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.security.KeyStore;

import org.springframework.stereotype.Service;

import stirling.software.SPDF.controller.api.security.CertSignController;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfSigningService;

/** Core implementation of {@link PdfSigningService} backed by {@link CertSignController}. */
@Service
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
            boolean showLogo,
            Double signatureRectX,
            Double signatureRectY,
            Double signatureRectWidth,
            Double signatureRectHeight)
            throws Exception {

        CertSignController.CreateSignature createSignature =
                new CertSignController.CreateSignature(keystore, password);

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        ByteArrayMultipartFile inputFile =
                new ByteArrayMultipartFile(pdfBytes, "document.pdf", "application/pdf");

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
                showLogo,
                signatureRectX,
                signatureRectY,
                signatureRectWidth,
                signatureRectHeight);

        return outputStream.toByteArray();
    }

    /** Minimal MultipartFile wrapper for passing raw PDF bytes to CertSignController.sign(). */
    private static class ByteArrayMultipartFile
            implements org.springframework.web.multipart.MultipartFile {
        private final byte[] content;
        private final String filename;
        private final String contentType;

        ByteArrayMultipartFile(byte[] content, String filename, String contentType) {
            this.content = content;
            this.filename = filename;
            this.contentType = contentType;
        }

        @Override
        public String getName() {
            return "file";
        }

        @Override
        public String getOriginalFilename() {
            return filename;
        }

        @Override
        public String getContentType() {
            return contentType;
        }

        @Override
        public boolean isEmpty() {
            return content == null || content.length == 0;
        }

        @Override
        public long getSize() {
            return content == null ? 0 : content.length;
        }

        @Override
        public byte[] getBytes() {
            return content;
        }

        @Override
        public java.io.InputStream getInputStream() {
            return new ByteArrayInputStream(content);
        }

        @Override
        public void transferTo(java.io.File dest) throws java.io.IOException {
            java.nio.file.Files.write(dest.toPath(), content);
        }
    }
}
