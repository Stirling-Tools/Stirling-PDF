package stirling.software.SPDF.service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.security.KeyStore;

import org.apache.pdfbox.examples.signature.CreateSignatureBase;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions;
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
                signatureField = new PDSignatureField(acroForm);
                PDField field = acroForm.getField("Signature");
                if (field == null) {
                    acroForm.getFields().add(signatureField);
                } else {
                    signatureField = (PDSignatureField) field;
                }

                // Set signature field properties
                signatureField.setPartialName("Signature");
                signatureField.setAlternateFieldName("Signature");

                // Set signature appearance
                PDAnnotationWidget widget = signatureField.getWidgets().get(0);

                // Position on specified page (0-indexed)
                int pageIndex = Math.max(0, Math.min(pageNumber, document.getNumberOfPages() - 1));
                org.apache.pdfbox.pdmodel.PDPage page = document.getPage(pageIndex);

                // Default rectangle for signature (adjustable)
                PDRectangle rect = new PDRectangle(50, 700, 200, 50);
                widget.setRectangle(rect);
                widget.setPage(page);

                // Add appearance with signer info
                PDAppearanceDictionary appearance = new PDAppearanceDictionary();
                PDAppearanceStream appearanceStream = new PDAppearanceStream(document);

                StringBuilder appearanceText = new StringBuilder();
                appearanceText.append("Sig: ").append(name != null ? name : "").append("\n");
                appearanceText
                        .append("Location: ")
                        .append(location != null ? location : "")
                        .append("\n");
                appearanceText.append("Reason: ").append(reason != null ? reason : "");
                if (showLogo) {
                    appearanceText.append("\n[Stirling-PDF]");
                }

                appearanceStream.setBBox(rect);
                appearanceStream.setResources(new PDResources());
                try (PDPageContentStream contentStream =
                        new PDPageContentStream(document, appearanceStream)) {
                    contentStream.beginText();
                    contentStream.setFont(
                            new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 10);
                    contentStream.newLineAtOffset(10, 10);
                    contentStream.showText(appearanceText.toString());
                    contentStream.endText();
                }
                appearance.setNormalAppearance(appearanceStream);
                widget.setAppearance(appearance);
            }

            // Prepare signature
            SignatureOptions signatureOptions = new SignatureOptions();
            signatureOptions.setPreferredSignatureSize(SignatureOptions.DEFAULT_SIGNATURE_SIZE * 2);

            PDSignature signature = new PDSignature();
            signature.setName("Signature");
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);

            // Sign the document
            document.addSignature(signature, createSignature, signatureOptions);
            document.save(outputStream);
            document.close();
        }

        return outputStream.toByteArray();
    }

    /** Inner class extending CreateSignatureBase for PDF signing. */
    private static class CreateSignatureImpl extends CreateSignatureBase {
        CreateSignatureImpl(KeyStore keystore, char[] password) throws Exception {
            super(keystore, password);
        }
    }
}
