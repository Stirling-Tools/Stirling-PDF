package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;
import java.security.NoSuchProviderException;
import java.security.Principal;
import java.security.PrivateKey;
import java.security.Security;
import java.security.UnrecoverableKeyException;
import java.security.cert.Certificate;
import java.security.cert.CertificateEncodingException;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Arrays;
import java.util.Date;
import java.util.List;

import javax.naming.ldap.LdapName;
import javax.naming.ldap.Rdn;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureInterface;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.visible.PDVisibleSigProperties;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.visible.PDVisibleSignDesigner;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.util.io.pem.PemReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.itextpdf.kernel.pdf.*;
import com.itextpdf.signatures.*;

import stirling.software.SPDF.utils.PdfUtils;

import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.security.*;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;

import com.itextpdf.kernel.geom.Rectangle;
@RestController
public class CertSignController {

    private static final Logger logger = LoggerFactory.getLogger(CertSignController.class);

    static {
        Security.addProvider(new BouncyCastleProvider());
    }

    @PostMapping(consumes = "multipart/form-data", value = "/cert-sign")
    public ResponseEntity<byte[]> signPDF(
            @RequestParam("pdf") MultipartFile pdf,
            @RequestParam(value = "certType", required = false) String certType,
            @RequestParam(value = "key", required = false) MultipartFile privateKeyFile,
            @RequestParam(value = "cert", required = false) MultipartFile certFile,
            @RequestParam(value = "p12", required = false) MultipartFile p12File,
            @RequestParam(value = "password", required = false) String password,
            @RequestParam(value = "showSignature", required = false) Boolean showSignature,
            @RequestParam(value = "reason", required = false) String reason,
            @RequestParam(value = "location", required = false) String location,
            @RequestParam(value = "name", required = false) String name,
            @RequestParam(value = "pageNumber", required = false) Integer pageNumber) throws Exception {
        
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

        // Set up the PDF reader and stamper
        PdfReader reader = new PdfReader(new ByteArrayInputStream(pdf.getBytes()));
        ByteArrayOutputStream signedPdf = new ByteArrayOutputStream();
        PdfSigner signer = new PdfSigner(reader, signedPdf, new StampingProperties());

        // Set up the signing appearance
        PdfSignatureAppearance appearance = signer.getSignatureAppearance()
                .setReason("Test")
                .setLocation("TestLocation");

        if (showSignature != null && showSignature) {
        	// Get the page size
        	PdfPage page = signer.getDocument().getPage(1);
        	Rectangle pageSize = page.getPageSize();

        	// Define the size of the signature rectangle
        	float sigWidth = 200;  // adjust this as needed
        	float sigHeight = 100; // adjust this as needed

        	// Define the margins from the page edges
        	float marginRight = 36; // adjust this as needed
        	float marginBottom = 36; // adjust this as needed

        	// Define the position and dimension of the signature field
        	Rectangle rect = new Rectangle(
        	    pageSize.getRight() - sigWidth - marginRight, 
        	    pageSize.getBottom() + marginBottom, 
        	    sigWidth, 
        	    sigHeight
        	);
            
            // Creating the appearance
            appearance
                .setPageRect(rect)
                .setPageNumber(pageNumber)
                .setReason(reason)
                .setLocation(location)
                .setLayer2Text(name) // Set the signer name to be displayed in the signature field
                .setReuseAppearance(false);
            signer.setFieldName("sig");
                
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
