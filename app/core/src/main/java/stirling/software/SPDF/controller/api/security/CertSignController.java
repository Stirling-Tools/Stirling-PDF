package stirling.software.SPDF.controller.api.security;

import java.awt.*;
import java.beans.PropertyEditorSupport;
import java.io.*;
import java.nio.file.Files;
import java.security.*;
import java.security.cert.Certificate;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Calendar;
import java.util.List;

import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.examples.signature.CreateSignatureBase;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName;
import org.apache.pdfbox.pdmodel.graphics.blend.BlendMode;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.util.Matrix;
import org.bouncycastle.asn1.pkcs.PrivateKeyInfo;
import org.bouncycastle.asn1.x500.RDN;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x500.style.BCStyle;
import org.bouncycastle.asn1.x500.style.IETFUtils;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.openssl.PEMDecryptorProvider;
import org.bouncycastle.openssl.PEMEncryptedKeyPair;
import org.bouncycastle.openssl.PEMKeyPair;
import org.bouncycastle.openssl.PEMParser;
import org.bouncycastle.openssl.jcajce.JcaPEMKeyConverter;
import org.bouncycastle.openssl.jcajce.JceOpenSSLPKCS8DecryptorProviderBuilder;
import org.bouncycastle.openssl.jcajce.JcePEMDecryptorProviderBuilder;
import org.bouncycastle.operator.InputDecryptorProvider;
import org.bouncycastle.operator.OperatorCreationException;
import org.bouncycastle.pkcs.PKCS8EncryptedPrivateKeyInfo;
import org.bouncycastle.pkcs.PKCSException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.micrometer.common.util.StringUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.security.MultiSignPDFWithCertRequest;
import stirling.software.SPDF.model.api.security.SignPDFWithCertRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.ServerCertificateServiceInterface;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/security")
@Slf4j
@Tag(name = "Security", description = "Security APIs")
public class CertSignController {

    static {
        Security.addProvider(new BouncyCastleProvider());
    }

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                MultipartFile.class,
                new PropertyEditorSupport() {
                    @Override
                    public void setAsText(String text) throws IllegalArgumentException {
                        setValue(null);
                    }
                });
    }

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ServerCertificateServiceInterface serverCertificateService;

    public CertSignController(
            CustomPDFDocumentFactory pdfDocumentFactory,
            @Autowired(required = false)
                    ServerCertificateServiceInterface serverCertificateService) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.serverCertificateService = serverCertificateService;
    }

    static void sign(
            CustomPDFDocumentFactory pdfDocumentFactory,
            MultipartFile input,
            OutputStream output,
            CreateSignature instance,
            Boolean showSignature,
            Integer pageNumber,
            String name,
            String location,
            String reason,
            Boolean showLogo) {
        try (PDDocument doc = pdfDocumentFactory.load(input)) {
            PDSignature signature = new PDSignature();
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
            signature.setName(name);
            signature.setLocation(location);
            signature.setReason(reason);
            signature.setSignDate(Calendar.getInstance()); // PDFBox requires Calendar
            if (Boolean.TRUE.equals(showSignature)) {
                SignatureOptions signatureOptions = new SignatureOptions();
                signatureOptions.setVisualSignature(
                        instance.createVisibleSignature(doc, signature, pageNumber, showLogo));
                signatureOptions.setPage(pageNumber);

                doc.addSignature(signature, instance, signatureOptions);

            } else {
                doc.addSignature(signature, instance);
            }
            doc.saveIncremental(output);
        } catch (Exception e) {
            ExceptionUtils.logException("PDF signing", e);
        }
    }

    static void sign(
            CustomPDFDocumentFactory pdfDocumentFactory,
            InputStream input,
            OutputStream output,
            CreateSignature instance,
            Boolean showSignature,
            Integer pageNumber,
            String name,
            String location,
            String reason,
            Boolean showLogo) {
        try (PDDocument doc = pdfDocumentFactory.load(input)) {
            PDSignature signature = new PDSignature();
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
            signature.setName(name);
            signature.setLocation(location);
            signature.setReason(reason);
            signature.setSignDate(Calendar.getInstance());
            if (Boolean.TRUE.equals(showSignature)) {
                SignatureOptions signatureOptions = new SignatureOptions();
                signatureOptions.setVisualSignature(
                        instance.createVisibleSignature(doc, signature, pageNumber, showLogo));
                signatureOptions.setPage(pageNumber);

                doc.addSignature(signature, instance, signatureOptions);

            } else {
                doc.addSignature(signature, instance);
            }
            doc.saveIncremental(output);
        } catch (Exception e) {
            ExceptionUtils.logException("PDF signing", e);
        }
    }

    @AutoJobPostMapping(
            consumes = {
                MediaType.MULTIPART_FORM_DATA_VALUE,
                MediaType.APPLICATION_FORM_URLENCODED_VALUE
            },
            value = "/cert-sign")
    @StandardPdfResponse
    @Operation(
            summary = "Sign PDF with a Digital Certificate",
            description =
                    "This endpoint accepts a PDF file, a digital certificate and related"
                            + " information to sign the PDF. It then returns the digitally signed PDF"
                            + " file. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> signPDFWithCert(@ModelAttribute SignPDFWithCertRequest request)
            throws Exception {
        MultipartFile pdf = request.getFileInput();
        String certType = request.getCertType();
        MultipartFile privateKeyFile = request.getPrivateKeyFile();
        MultipartFile certFile = request.getCertFile();
        MultipartFile p12File = request.getP12File();
        MultipartFile jksfile = request.getJksFile();
        String password = request.getPassword();
        Boolean showSignature = request.getShowSignature();
        String reason = request.getReason();
        String location = request.getLocation();
        String name = request.getName();
        // Convert 1-indexed page number (user input) to 0-indexed page number (API requirement)
        Integer pageNumber = request.getPageNumber() != null ? (request.getPageNumber() - 1) : null;
        Boolean showLogo = request.getShowLogo();

        if (StringUtils.isBlank(certType)) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.optionsNotSpecified",
                    "{0} options are not specified",
                    "certificate type");
        }

        KeyStore ks = null;
        String keystorePassword = password;

        switch (certType) {
            case "PEM":
                ks = KeyStore.getInstance("JKS");
                ks.load(null);
                PrivateKey privateKey = getPrivateKeyFromPEM(privateKeyFile.getBytes(), password);
                Certificate cert = (Certificate) getCertificateFromPEM(certFile.getBytes());
                ks.setKeyEntry(
                        "alias", privateKey, password.toCharArray(), new Certificate[] {cert});
                break;
            case "PKCS12":
            case "PFX":
                ks = KeyStore.getInstance("PKCS12");
                ks.load(p12File.getInputStream(), password.toCharArray());
                break;
            case "JKS":
                ks = KeyStore.getInstance("JKS");
                ks.load(jksfile.getInputStream(), password.toCharArray());
                break;
            case "SERVER":
                if (serverCertificateService == null) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.serverCertificateNotAvailable",
                            "Server certificate service is not available in this edition");
                }
                if (!serverCertificateService.isEnabled()) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.serverCertificateDisabled",
                            "Server certificate feature is disabled");
                }
                if (!serverCertificateService.hasServerCertificate()) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.serverCertificateNotFound", "No server certificate configured");
                }
                ks = serverCertificateService.getServerKeyStore();
                keystorePassword = serverCertificateService.getServerCertificatePassword();
                break;
            default:
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidArgument",
                        "Invalid argument: {0}",
                        "certificate type: " + certType);
        }

        CreateSignature createSignature = new CreateSignature(ks, keystorePassword.toCharArray());
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        sign(
                pdfDocumentFactory,
                pdf,
                baos,
                createSignature,
                showSignature,
                pageNumber,
                name,
                location,
                reason,
                showLogo);
        // Return the signed PDF
        return WebResponseUtils.bytesToWebResponse(
                baos.toByteArray(),
                GeneralUtils.generateFilename(pdf.getOriginalFilename(), "_signed.pdf"));
    }

    @AutoJobPostMapping(
            consumes = {
                MediaType.MULTIPART_FORM_DATA_VALUE,
                MediaType.APPLICATION_FORM_URLENCODED_VALUE
            },
            value = "/cert-sign/multi")
    @StandardPdfResponse
    @Operation(
            summary = "Sign PDF with multiple Digital Certificates",
            description =
                    "This endpoint accepts a PDF file and multiple digital certificates to"
                            + " sequentially sign the document. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> multiSignPDFWithCert(
            @ModelAttribute MultiSignPDFWithCertRequest request) throws Exception {
        if (request.getCertTypes() == null || request.getCertTypes().isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.optionsNotSpecified",
                    "{0} options are not specified",
                    "certificate types");
        }

        byte[] currentPdf = request.getFileInput().getBytes();
        String originalFilename = request.getFileInput().getOriginalFilename();

        for (int i = 0; i < request.getCertTypes().size(); i++) {
            String certType = request.getCertTypes().get(i);
            KeyStore ks = null;
            String keystorePassword = getFromList(request.getPasswords(), i, "");

            switch (certType) {
                case "PEM":
                    ks = KeyStore.getInstance("JKS");
                    ks.load(null);
                    MultipartFile privateKeyFile = getFromList(request.getPrivateKeyFiles(), i, null);
                    MultipartFile certFile = getFromList(request.getCertFiles(), i, null);
                    if (privateKeyFile == null || certFile == null) {
                        throw ExceptionUtils.createIllegalArgumentException(
                                "error.optionsNotSpecified",
                                "{0} options are not specified",
                                "certificate and key files for signer " + (i + 1));
                    }
                    PrivateKey privateKey =
                            getPrivateKeyFromPEM(privateKeyFile.getBytes(), keystorePassword);
                    Certificate cert = (Certificate) getCertificateFromPEM(certFile.getBytes());
                    ks.setKeyEntry(
                            "alias", privateKey, keystorePassword.toCharArray(), new Certificate[] {cert});
                    break;
                case "PKCS12":
                case "PFX":
                    MultipartFile p12File = getFromList(request.getP12Files(), i, null);
                    if (p12File == null) {
                        throw ExceptionUtils.createIllegalArgumentException(
                                "error.optionsNotSpecified",
                                "{0} options are not specified",
                                "PKCS12/PFX keystore for signer " + (i + 1));
                    }
                    ks = KeyStore.getInstance("PKCS12");
                    ks.load(p12File.getInputStream(), keystorePassword.toCharArray());
                    break;
                case "JKS":
                    MultipartFile jksfile = getFromList(request.getJksFiles(), i, null);
                    if (jksfile == null) {
                        throw ExceptionUtils.createIllegalArgumentException(
                                "error.optionsNotSpecified",
                                "{0} options are not specified",
                                "JKS keystore for signer " + (i + 1));
                    }
                    ks = KeyStore.getInstance("JKS");
                    ks.load(jksfile.getInputStream(), keystorePassword.toCharArray());
                    break;
                case "SERVER":
                    if (serverCertificateService == null) {
                        throw ExceptionUtils.createIllegalArgumentException(
                                "error.serverCertificateNotAvailable",
                                "Server certificate service is not available in this edition");
                    }
                    if (!serverCertificateService.isEnabled()) {
                        throw ExceptionUtils.createIllegalArgumentException(
                                "error.serverCertificateDisabled",
                                "Server certificate feature is disabled");
                    }
                    if (!serverCertificateService.hasServerCertificate()) {
                        throw ExceptionUtils.createIllegalArgumentException(
                                "error.serverCertificateNotFound",
                                "No server certificate configured");
                    }
                    ks = serverCertificateService.getServerKeyStore();
                    keystorePassword = serverCertificateService.getServerCertificatePassword();
                    break;
                default:
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.invalidArgument",
                            "Invalid argument: {0}",
                            "certificate type: " + certType);
            }

            CreateSignature createSignature = new CreateSignature(ks, keystorePassword.toCharArray());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            String signerName = getFromList(request.getNames(), i, "SPDF");
            String location = getFromList(request.getLocations(), i, "SPDF");
            String reason = getFromList(request.getReasons(), i, "Signed by SPDF");
            Boolean showSignature = getFromList(request.getShowSignatures(), i, Boolean.FALSE);
            Boolean showLogo = getFromList(request.getShowLogos(), i, Boolean.TRUE);
            Integer pageNumber = getFromList(request.getPageNumbers(), i, null);
            pageNumber = pageNumber != null ? pageNumber - 1 : null;

            sign(
                    pdfDocumentFactory,
                    new ByteArrayInputStream(currentPdf),
                    baos,
                    createSignature,
                    showSignature,
                    pageNumber,
                    signerName,
                    location,
                    reason,
                    showLogo);
            currentPdf = baos.toByteArray();
        }

        return WebResponseUtils.bytesToWebResponse(
                currentPdf, GeneralUtils.generateFilename(originalFilename, "_multi_signed.pdf"));
    }

    private static <T> T getFromList(List<T> list, int index, T defaultValue) {
        if (list == null || list.size() <= index) {
            return defaultValue;
        }
        return list.get(index);
    }

    public PrivateKey getPrivateKeyFromPEM(byte[] pemBytes, String password)
            throws IOException, OperatorCreationException, PKCSException {
        try (PEMParser pemParser =
                new PEMParser(new InputStreamReader(new ByteArrayInputStream(pemBytes)))) {
            Object pemObject = pemParser.readObject();
            JcaPEMKeyConverter converter = new JcaPEMKeyConverter().setProvider("BC");
            PrivateKeyInfo pkInfo;
            if (pemObject instanceof PKCS8EncryptedPrivateKeyInfo pkcs8EncryptedPrivateKeyInfo) {
                InputDecryptorProvider decProv =
                        new JceOpenSSLPKCS8DecryptorProviderBuilder().build(password.toCharArray());
                pkInfo = pkcs8EncryptedPrivateKeyInfo.decryptPrivateKeyInfo(decProv);
            } else if (pemObject instanceof PEMEncryptedKeyPair pemEncryptedKeyPair) {
                PEMDecryptorProvider decProv =
                        new JcePEMDecryptorProviderBuilder().build(password.toCharArray());
                pkInfo = pemEncryptedKeyPair.decryptKeyPair(decProv).getPrivateKeyInfo();
            } else {
                pkInfo = ((PEMKeyPair) pemObject).getPrivateKeyInfo();
            }
            return converter.getPrivateKey(pkInfo);
        }
    }

    public Certificate getCertificateFromPEM(byte[] pemBytes)
            throws IOException, CertificateException {
        try (ByteArrayInputStream bis = new ByteArrayInputStream(pemBytes)) {
            return CertificateFactory.getInstance("X.509").generateCertificate(bis);
        }
    }

    static class CreateSignature extends CreateSignatureBase {
        File logoFile;

        public CreateSignature(KeyStore keystore, char[] pin)
                throws KeyStoreException,
                        UnrecoverableKeyException,
                        NoSuchAlgorithmException,
                        IOException,
                        CertificateException {
            super(keystore, pin);
            ClassPathResource resource = new ClassPathResource("static/images/signature.png");
            try (InputStream is = resource.getInputStream()) {
                logoFile = Files.createTempFile("signature", ".png").toFile();
                FileUtils.copyInputStreamToFile(is, logoFile);
            } catch (IOException e) {
                log.error("Failed to load image signature file");
                throw e;
            }
        }

        public InputStream createVisibleSignature(
                PDDocument srcDoc, PDSignature signature, Integer pageNumber, Boolean showLogo)
                throws IOException {
            // modified from org.apache.pdfbox.examples.signature.CreateVisibleSignature2
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(srcDoc.getPage(pageNumber).getMediaBox());
                doc.addPage(page);
                PDAcroForm acroForm = new PDAcroForm(doc);
                doc.getDocumentCatalog().setAcroForm(acroForm);
                PDSignatureField signatureField = new PDSignatureField(acroForm);
                PDAnnotationWidget widget = signatureField.getWidgets().get(0);
                List<PDField> acroFormFields = acroForm.getFields();
                acroForm.setSignaturesExist(true);
                acroForm.setAppendOnly(true);
                acroForm.getCOSObject().setDirect(true);
                acroFormFields.add(signatureField);

                PDRectangle rect = new PDRectangle(0, 0, 200, 50);

                widget.setRectangle(rect);

                // from PDVisualSigBuilder.createHolderForm()
                PDStream stream = new PDStream(doc);
                PDFormXObject form = new PDFormXObject(stream);
                PDResources res = new PDResources();
                form.setResources(res);
                form.setFormType(1);
                PDRectangle bbox = new PDRectangle(rect.getWidth(), rect.getHeight());
                float height = bbox.getHeight();
                form.setBBox(bbox);
                PDFont font = new PDType1Font(FontName.TIMES_BOLD);

                // from PDVisualSigBuilder.createAppearanceDictionary()
                PDAppearanceDictionary appearance = new PDAppearanceDictionary();
                appearance.getCOSObject().setDirect(true);
                PDAppearanceStream appearanceStream = new PDAppearanceStream(form.getCOSObject());
                appearance.setNormalAppearance(appearanceStream);
                widget.setAppearance(appearance);

                try (PDPageContentStream cs = new PDPageContentStream(doc, appearanceStream)) {
                    if (Boolean.TRUE.equals(showLogo)) {
                        cs.saveGraphicsState();
                        PDExtendedGraphicsState extState = new PDExtendedGraphicsState();
                        extState.setBlendMode(BlendMode.MULTIPLY);
                        extState.setNonStrokingAlphaConstant(0.5f);
                        cs.setGraphicsStateParameters(extState);
                        cs.transform(Matrix.getScaleInstance(0.08f, 0.08f));
                        PDImageXObject img =
                                PDImageXObject.createFromFileByExtension(logoFile, doc);
                        cs.drawImage(img, 100, 0);
                        cs.restoreGraphicsState();
                    }

                    // show text
                    float fontSize = 10;
                    float leading = fontSize * 1.5f;
                    cs.beginText();
                    cs.setFont(font, fontSize);
                    cs.setNonStrokingColor(Color.black);
                    cs.newLineAtOffset(fontSize, height - leading);
                    cs.setLeading(leading);

                    X509Certificate cert = (X509Certificate) getCertificateChain()[0];

                    // https://stackoverflow.com/questions/2914521/
                    X500Name x500Name = new X500Name(cert.getSubjectX500Principal().getName());
                    RDN cn = x500Name.getRDNs(BCStyle.CN)[0];
                    String name = IETFUtils.valueToString(cn.getFirst().getValue());

                    String date = signature.getSignDate().getTime().toString();
                    String reason = signature.getReason();

                    cs.showText("Signed by " + name);
                    cs.newLine();
                    cs.showText(date);
                    cs.newLine();
                    cs.showText(reason);

                    cs.endText();
                }

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                doc.save(baos);
                return new ByteArrayInputStream(baos.toByteArray());
            }
        }
    }
}
