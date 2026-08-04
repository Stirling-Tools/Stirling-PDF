package stirling.software.SPDF.service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.KeyStore;

import org.apache.pdfbox.examples.signature.CreateSignatureBase;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureInterface;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.springframework.stereotype.Service;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfSigningService;

/** Core implementation of {@link PdfSigningService} backed by PDFBox signing APIs. */
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
            boolean showLogo)
            throws Exception {

        CreateSignatureBase createSignature = new CreateSignatureImpl(keystore, password);

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        
        try (PDDocument document = pdfDocumentFactory.load(new ByteArrayInputStream(pdfBytes))) {
            PDAcroForm acroForm = document.getDocumentCatalog().getAcroForm();
            if (acroForm == null) {
                acroForm = new PDAcroForm(document);
                document.getDocumentCatalog().setAcroForm(acroForm);
            }

            PDSignatureField signatureField;
            if (showSignature && pageNumber != null) {
                // Create visible signature field
                signatureField = new PDSignatureField(document);
                PDField field = acroForm.getField("Signature");
                if (field == null) {
                    acroForm.addField(signatureField);
                } else {
                    signatureField = (PDSignatureField) field;
                }
                
                // Set signature field properties
                signatureField.setPartialName("Signature");
                signatureField.setAlternateFieldName("Signature");
                
                // Set signature appearance
                org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget widget = 
                    signatureField.getWidgets().get(0);
                
                // Position on specified page (0-indexed)
                int pageIndex = Math.max(0, Math.min(pageNumber, document.getNumberOfPages() - 1));
                org.apache.pdfbox.pdmodel.PDPage page = document.getPage(pageIndex);
                
                // Default rectangle for signature (adjustable)
                org.apache.pdfbox.pdmodel.common.PDRectangle rect = 
                    new org.apache.pdfbox.pdmodel.common.PDRectangle(50, 700, 200, 50);
                widget.setRectangle(rect);
                widget.setPage(page);
                
                // Add appearance with signer info
                org.apache.pdfbox.pdmodel.interactive.appearance.PDAppearanceDictionary appearance = 
                    new org.apache.pdfbox.pdmodel.interactive.appearance.PDAppearanceDictionary();
                org.apache.pdfbox.pdmodel.interactive.appearance.PDAppearanceStream appearanceStream = 
                    new org.apache.pdfbox.pdmodel.interactive.appearance.PDAppearanceStream(document);
                
                StringBuilder appearanceText = new StringBuilder();
                appearanceText.append("Sig: ").append(name != null ? name : "").append("\n");
                appearanceText.append("Location: ").append(location != null ? location : "").append("\n");
                appearanceText.append("Reason: ").append(reason != null ? reason : "");
                if (showLogo) {
                    appearanceText.append("\n[Stirling-PDF]");
                }
                
                appearanceStream.setResources(new org.apache.pdfbox.pdmodel.PDResources());
                appearanceStream.addAppearance("BDC", appearanceText.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                appearance.setNormalAppearance(appearanceStream);
                widget.setAppearance(appearance);
            }

            // Prepare signature
            PDDocument.CryptoFilter cf = new PDDocument.CryptoFilter() {};
            SignatureOptions signatureOptions = new SignatureOptions();
            signatureOptions.setPreferredSignatureSize(SignatureOptions.DEFAULT_SIGNATURE_SIZE * 2);
            
            // Sign the document
            document.addSignature("Signature", createSignature, signatureOptions);
            document.save(outputStream);
            document.close();
        }

        return outputStream.toByteArray();
    }
    
    /** Inner class extending CreateSignatureBase for PDF signing. */
    private static class CreateSignatureImpl extends CreateSignatureBase {
        CreateSignatureImpl(KeyStore keystore, char[] pin) throws Exception {
            super(keystore, pin);
        }
    }
}
