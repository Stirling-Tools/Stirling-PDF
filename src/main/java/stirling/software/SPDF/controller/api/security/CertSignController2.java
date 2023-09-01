package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayInputStream;
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

import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cms.CMSException;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.CMSSignedDataGenerator;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.OperatorCreationException;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;
import org.bouncycastle.cms.CMSTypedData;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Security;
import java.security.cert.CertificateEncodingException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Collections;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ContentDisposition;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.ResponseEntity;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.utils.WebResponseUtils;

import org.apache.commons.io.IOUtils;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.ExternalSigningSupport;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.visible.PDVisibleSignDesigner;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.visible.PDVisibleSigProperties;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
@RestController
@Tag(name = "Security", description = "Security APIs")
public class CertSignController2 {

    private static final Logger logger = LoggerFactory.getLogger(CertSignController2.class);

    static {
        Security.addProvider(new BouncyCastleProvider());
    }

    @PostMapping(consumes = "multipart/form-data", value = "/cert-sign")
    @Operation(summary = "Sign PDF with a Digital Certificate",
        description = "This endpoint accepts a PDF file, a digital certificate and related information to sign the PDF. It then returns the digitally signed PDF file. Input:PDF Output:PDF Type:MF-SISO")
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
        PDSignature signature = new PDSignature();
        signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE); // default filter
        signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
        signature.setName(name);
        signature.setLocation(location);
        signature.setReason(reason);

        // Load the PDF
        try (PDDocument document = PDDocument.load(pdf.getBytes())) {
            SignatureOptions signatureOptions = new SignatureOptions();

            // If you want to show the signature
            if (showSignature != null && showSignature) {
                // Calculate signature field position based on your requirements

                PDPage page = document.getPage(pageNumber - 1); // zero-based

                PDVisibleSignDesigner signDesigner = new PDVisibleSignDesigner(new ByteArrayInputStream(pdf.getBytes()));
                //TODO signDesigner
                
                PDVisibleSigProperties sigProperties = new PDVisibleSigProperties();
                
                //TODO sigProperties extra
                signatureOptions.setVisualSignature(sigProperties);
                signatureOptions.setPage(pageNumber - 1);
            }

            document.addSignature(signature, signatureOptions);

         // External signing
            ExternalSigningSupport externalSigning = document.saveIncrementalForExternalSigning(new ByteArrayOutputStream());

            byte[] content = IOUtils.toByteArray(externalSigning.getContent());

            // Using BouncyCastle to sign
            CMSTypedData cmsData = new CMSProcessableByteArray(content);

            CMSSignedDataGenerator gen = new CMSSignedDataGenerator();
            ContentSigner signer = new JcaContentSignerBuilder("SHA256withRSA").setProvider(provider).build(privateKey);

            gen.addSignerInfoGenerator(new JcaSignerInfoGeneratorBuilder(
                    new JcaDigestCalculatorProviderBuilder().setProvider(provider).build()).build(signer, cert));

            gen.addCertificates(new JcaCertStore(Collections.singletonList(cert)));
            CMSSignedData signedData = gen.generate(cmsData, false);
  
            byte[] cmsSignature = signedData.getEncoded();

            externalSigning.setSignature(cmsSignature);


	         // After setting the signature, return the resultant PDF
	         try (ByteArrayOutputStream signedPdfOutput = new ByteArrayOutputStream()) {
	             document.save(signedPdfOutput);
	             HttpHeaders headers = new HttpHeaders();
	             headers.setContentType(MediaType.APPLICATION_PDF);
	             headers.setContentDisposition(ContentDisposition.builder("attachment").filename("signed.pdf").build());
	             
	             return new ResponseEntity<>(signedPdfOutput.toByteArray(), headers, HttpStatus.OK);
	         }
        }

       
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
