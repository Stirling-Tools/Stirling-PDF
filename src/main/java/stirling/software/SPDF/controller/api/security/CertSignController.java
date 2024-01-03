package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;
import java.security.Security;
import java.security.UnrecoverableKeyException;
import java.security.cert.CertificateException;
import java.util.Calendar;

import org.apache.pdfbox.examples.signature.CreateSignatureBase;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.security.SignPDFWithCertRequest;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
public class CertSignController {

    private static final Logger logger = LoggerFactory.getLogger(CertSignController.class);

    static {
        Security.addProvider(new BouncyCastleProvider());
    }

    class CreateSignature extends CreateSignatureBase {
        public CreateSignature(KeyStore keystore, char[] pin)
                throws KeyStoreException,
                        UnrecoverableKeyException,
                        NoSuchAlgorithmException,
                        IOException,
                        CertificateException {
            super(keystore, pin);
        }
    }

    @PostMapping(consumes = "multipart/form-data", value = "/cert-sign")
    @Operation(
            summary = "Sign PDF with a Digital Certificate",
            description =
                    "This endpoint accepts a PDF file, a digital certificate and related information to sign the PDF. It then returns the digitally signed PDF file. Input:PDF Output:PDF Type:MF-SISO")
    public ResponseEntity<byte[]> signPDFWithCert(@ModelAttribute SignPDFWithCertRequest request)
            throws Exception {
        MultipartFile pdf = request.getFileInput();
        String certType = request.getCertType();
        MultipartFile privateKeyFile = request.getPrivateKeyFile();
        MultipartFile certFile = request.getCertFile();
        MultipartFile p12File = request.getP12File();
        String password = request.getPassword();
        Boolean showSignature = request.isShowSignature();
        String reason = request.getReason();
        String location = request.getLocation();
        String name = request.getName();
        Integer pageNumber = request.getPageNumber();

        if (certType == null) {
            throw new IllegalArgumentException("Cert type must be provided");
        }

        InputStream ksInputStream = null;

        switch (certType) {
            case "PKCS12":
                ksInputStream = p12File.getInputStream();
                break;
            case "PEM":
                throw new IllegalArgumentException("TODO: PEM not supported yet");
                // ksInputStream = privateKeyFile.getInputStream();
                // break;
            default:
                throw new IllegalArgumentException("Invalid cert type: " + certType);
        }

        // TODO: page number

        KeyStore ks = getKeyStore(ksInputStream, password);
        CreateSignature createSignature = new CreateSignature(ks, password.toCharArray());
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        sign(pdf.getBytes(), baos, createSignature, name, location, reason);
        return WebResponseUtils.boasToWebResponse(
                baos, pdf.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_signed.pdf");
    }

    private static KeyStore getKeyStore(InputStream is, String password) throws Exception {
        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(is, password.toCharArray());
        return ks;
    }

    private static void sign(
            byte[] input,
            OutputStream output,
            CreateSignature instance,
            String name,
            String location,
            String reason) {
        try (PDDocument doc = PDDocument.load(input)) {
            PDSignature signature = new PDSignature();
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
            signature.setName(name);
            signature.setLocation(location);
            signature.setReason(reason);
            signature.setSignDate(Calendar.getInstance());

            doc.addSignature(signature, instance);
            doc.saveIncremental(output);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // private byte[] parsePEM(byte[] content) throws IOException {
    //     PemReader pemReader =
    //             new PemReader(new InputStreamReader(new ByteArrayInputStream(content)));
    //     return pemReader.readPemObject().getContent();
    // }

    // private boolean isPEM(byte[] content) {
    //     String contentStr = new String(content);
    //     return contentStr.contains("-----BEGIN") && contentStr.contains("-----END");
    // }
}
