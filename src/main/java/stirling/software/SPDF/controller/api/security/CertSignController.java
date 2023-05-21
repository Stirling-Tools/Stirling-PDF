package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayInputStream;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.security.KeyFactory;
import java.security.KeyStore;
import java.security.Principal;
import java.security.PrivateKey;
import java.security.Security;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.PKCS8EncodedKeySpec;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.List;

import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.util.io.pem.PemReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.itextpdf.io.font.constants.StandardFonts;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfPage;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.kernel.pdf.StampingProperties;
import com.itextpdf.signatures.BouncyCastleDigest;
import com.itextpdf.signatures.DigestAlgorithms;
import com.itextpdf.signatures.IExternalDigest;
import com.itextpdf.signatures.IExternalSignature;
import com.itextpdf.signatures.PdfPKCS7;
import com.itextpdf.signatures.PdfSignatureAppearance;
import com.itextpdf.signatures.PdfSigner;
import com.itextpdf.signatures.PrivateKeySignature;
import com.itextpdf.signatures.SignatureUtil;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import stirling.software.SPDF.utils.PdfUtils;
@RestController
public class CertSignController {

    private static final Logger logger = LoggerFactory.getLogger(CertSignController.class);

    static {
        Security.addProvider(new BouncyCastleProvider());
    }

    @PostMapping(consumes = "multipart/form-data", value = "/cert-sign")
    @Operation(summary = "Sign PDF with a Digital Certificate",
        description = "This endpoint accepts a PDF file, a digital certificate and related information to sign the PDF. It then returns the digitally signed PDF file.")
    public ResponseEntity<byte[]> signPDF(
        @RequestPart(required = true, value = "fileInput")
        @Parameter(description = "The input PDF file to be signed")
                MultipartFile pdf,

        @RequestParam(value = "certType", required = false)
        @Parameter(description = "The type of the digital certificate", schema = @Schema(allowableValues = {"PKCS12", "PEM"}))
                String certType,

        @RequestParam(value = "key", required = false)
        @Parameter(description = "The private key for the digital certificate (required for PEM type certificates)")
                MultipartFile privateKeyFile,

        @RequestParam(value = "cert", required = false)
        @Parameter(description = "The digital certificate (required for PEM type certificates)")
                MultipartFile certFile,

        @RequestParam(value = "p12", required = false)
        @Parameter(description = "The PKCS12 keystore file (required for PKCS12 type certificates)")
                MultipartFile p12File,

        @RequestParam(value = "password", required = false)
        @Parameter(description = "The password for the keystore or the private key")
                String password,

        @RequestParam(value = "showSignature", required = false)
        @Parameter(description = "Whether to visually show the signature in the PDF file")
                Boolean showSignature,

        @RequestParam(value = "reason", required = false)
        @Parameter(description = "The reason for signing the PDF")
                String reason,

        @RequestParam(value = "location", required = false)
        @Parameter(description = "The location where the PDF is signed")
                String location,

        @RequestParam(value = "name", required = false)
        @Parameter(description = "The name of the signer")
                String name,

        @RequestParam(value = "pageNumber", required = false)
        @Parameter(description = "The page number where the signature should be visible. This is required if showSignature is set to true")
                Integer pageNumber) throws Exception {
        
        BouncyCastleProvider provider = new BouncyCastleProvider();
        Security.addProvider(provider);

        PrivateKey privateKey = null;
        X509Certificate cert = null;
        
        if (certType != null) {
            switch (certType) {
                case "PKCS12":
                    if (p12File != null) {
                        KeyStore ks = KeyStore.getInstance("PKCS12");
                        ks.load(new ByteArrayInputStream(p12File.getBytes()), password.toCharArray());
                        String alias = ks.aliases().nextElement();
                        privateKey = (PrivateKey) ks.getKey(alias, password.toCharArray());
                        cert = (X509Certificate) ks.getCertificate(alias);
                    }
                    break;
                case "PEM":
                    if (privateKeyFile != null && certFile != null) {
                        // Load private key
                        KeyFactory keyFactory = KeyFactory.getInstance("RSA", provider);
                        if (isPEM(privateKeyFile.getBytes())) {
                            privateKey = keyFactory.generatePrivate(new PKCS8EncodedKeySpec(parsePEM(privateKeyFile.getBytes())));
                        } else {
                            privateKey = keyFactory.generatePrivate(new PKCS8EncodedKeySpec(privateKeyFile.getBytes()));
                        }

                        // Load certificate
                        CertificateFactory certFactory = CertificateFactory.getInstance("X.509", provider);
                        if (isPEM(certFile.getBytes())) {
                            cert = (X509Certificate) certFactory.generateCertificate(new ByteArrayInputStream(parsePEM(certFile.getBytes())));
                        } else {
                            cert = (X509Certificate) certFactory.generateCertificate(new ByteArrayInputStream(certFile.getBytes()));
                        }
                    }
                    break;
            }
        }

        Principal principal = cert.getSubjectDN();
        String dn = principal.getName();

        // Extract the "CN" (Common Name) field from the distinguished name (if it's present)
        String cn = null;
        for (String part : dn.split(",")) {
            if (part.trim().startsWith("CN=")) {
                cn = part.trim().substring("CN=".length());
                break;
            }
        }
        
        // Set up the PDF reader and stamper
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdf.getBytes()));
        ByteArrayOutputStream signedPdf = new ByteArrayOutputStream();
        PdfSigner signer = new PdfSigner(reader, signedPdf, new StampingProperties());

        // Set up the signing appearance
        PdfSignatureAppearance appearance = signer.getSignatureAppearance()
                .setReason("Test")
                .setLocation("TestLocation");

        if (showSignature != null && showSignature) {
            float fontSize = 4;  // the font size of the signature
            float marginRight = 36; // Margin from the right
            float marginBottom = 36; // Margin from the bottom
            String signingDate = new SimpleDateFormat("yyyy.MM.dd HH:mm:ss z").format(new Date());

            // Prepare the text for the digital signature
            String layer2Text = String.format("Digitally signed by: %s\nDate: %s\nReason: %s\nLocation: %s", name, signingDate, reason, location);

            // Get the PDF font and measure the width and height of the text block
            PdfFont font = PdfFontFactory.createFont(StandardFonts.HELVETICA_BOLD);
            float textWidth = Arrays.stream(layer2Text.split("\n"))
                                    .map(line -> font.getWidth(line, fontSize))
                                    .max(Float::compare)
                                    .orElse(0f);
            int numLines = layer2Text.split("\n").length;
            float textHeight = numLines * fontSize;

            // Calculate the signature rectangle size
            float sigWidth = textWidth + marginRight * 2;
            float sigHeight = textHeight + marginBottom * 2;

            // Get the page size
            PdfPage page = signer.getDocument().getPage(1);
            Rectangle pageSize = page.getPageSize();

            // Define the position and dimension of the signature field
            Rectangle rect = new Rectangle(
                pageSize.getRight() - sigWidth - marginRight,
                pageSize.getBottom() + marginBottom,
                sigWidth,
                sigHeight
            );

            // Configure the appearance of the digital signature
            appearance.setPageRect(rect)
                      .setContact(name)
                      .setPageNumber(pageNumber)
                      .setReason(reason)
                      .setLocation(location)
                      .setReuseAppearance(false)
                      .setLayer2Text(layer2Text);

            signer.setFieldName("sig");
        } else {
            appearance.setRenderingMode(PdfSignatureAppearance.RenderingMode.DESCRIPTION);
        }
        
        // Set up the signer
        PrivateKeySignature pks = new PrivateKeySignature(privateKey, DigestAlgorithms.SHA256, provider.getName());
        IExternalSignature pss = new PrivateKeySignature(privateKey, DigestAlgorithms.SHA256, provider.getName());
        IExternalDigest digest = new BouncyCastleDigest();

        // Call iTex7 to sign the PDF
        signer.signDetached(digest, pks, new Certificate[] {cert}, null, null, null, 0, PdfSigner.CryptoStandard.CMS);

        
        System.out.println("Signed PDF size: " + signedPdf.size());

        System.out.println("PDF signed = " + isPdfSigned(signedPdf.toByteArray()));
        return PdfUtils.bytesToWebResponse(signedPdf.toByteArray(), "example.pdf");
    }

public boolean isPdfSigned(byte[] pdfData) throws IOException {
    InputStream pdfStream = new ByteArrayInputStream(pdfData);
    PdfDocument pdfDoc = new PdfDocument(new PdfReader(pdfStream));
    SignatureUtil signatureUtil = new SignatureUtil(pdfDoc);
    List<String> names = signatureUtil.getSignatureNames();

    boolean isSigned = false;

    for (String name : names) {
        PdfPKCS7 pkcs7 = signatureUtil.readSignatureData(name);
        if (pkcs7 != null) {
            System.out.println("Signature found.");

            // Log certificate details
            Certificate[] signChain = pkcs7.getSignCertificateChain();
            for (Certificate cert : signChain) {
                if (cert instanceof X509Certificate) {
                    X509Certificate x509 = (X509Certificate) cert;
                    System.out.println("Certificate Details:");
                    System.out.println("Subject: " + x509.getSubjectDN());
                    System.out.println("Issuer: " + x509.getIssuerDN());
                    System.out.println("Serial: " + x509.getSerialNumber());
                    System.out.println("Not Before: " + x509.getNotBefore());
                    System.out.println("Not After: " + x509.getNotAfter());
                }
            }

            isSigned = true;
        }
    }

    pdfDoc.close();

    return isSigned;
}
    private byte[] parsePEM(byte[] content) throws IOException {
        PemReader pemReader = new PemReader(new InputStreamReader(new ByteArrayInputStream(content)));
        return pemReader.readPemObject().getContent();
    }

    private boolean isPEM(byte[] content) {
        String contentStr = new String(content);
        return contentStr.contains("-----BEGIN") && contentStr.contains("-----END");
    }
   

    


}
