package stirling.software.SPDF.controller.api.security;

import java.awt.*;
import java.beans.PropertyEditorSupport;
import java.io.*;
import java.nio.file.Files;
import java.security.*;
import java.security.cert.Certificate;
import java.security.cert.CertificateEncodingException;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Calendar;
import java.util.List;
import java.util.Map;

import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSUpdateInfo;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.COSObjectable;
import org.apache.pdfbox.pdmodel.common.PDNumberTreeNode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDObjectReference;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureElement;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureNode;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;
import org.apache.pdfbox.pdmodel.documentinterchange.taggedpdf.StandardStructureTypes;
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
import org.springframework.core.io.Resource;
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

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.security.HardwareCertificateInfo;
import stirling.software.SPDF.model.api.security.SignPDFWithCertRequest;
import stirling.software.SPDF.pdf.signature.CreateSignatureBase;
import stirling.software.SPDF.pdf.signature.SignatureTextWriter;
import stirling.software.SPDF.service.HardwareKeyStoreService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.ServerCertificateServiceInterface;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/security")
@Slf4j
@Tag(name = "Security", description = "Security APIs")
public class CertSignController {

    private static final int SIGNER_INFO_ALLOWANCE = 4096;

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
    private final TempFileManager tempFileManager;
    private final HardwareKeyStoreService hardwareKeyStoreService;

    public CertSignController(
            CustomPDFDocumentFactory pdfDocumentFactory,
            @Autowired(required = false) ServerCertificateServiceInterface serverCertificateService,
            TempFileManager tempFileManager,
            HardwareKeyStoreService hardwareKeyStoreService) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.serverCertificateService = serverCertificateService;
        this.tempFileManager = tempFileManager;
        this.hardwareKeyStoreService = hardwareKeyStoreService;
    }

    @GetMapping("/cert-sign/server-certificate")
    @Operation(
            summary = "Describe the server signing certificate",
            description =
                    "The identity that signing with certType=SERVER uses: name, issuer and validity."
                            + " 404 when no server certificate is available.")
    public ResponseEntity<HardwareCertificateInfo> getServerCertificate() throws Exception {
        if (serverCertificateService == null
                || !serverCertificateService.isEnabled()
                || !serverCertificateService.hasServerCertificate()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(
                HardwareKeyStoreService.toInfo(
                        "server", serverCertificateService.getServerCertificate(), "SERVER", null));
    }

    /**
     * Signs {@code input} into {@code output}. Failures propagate: {@code output} may hold partial
     * bytes afterwards, and catching them here would let the endpoint answer 200 with an empty PDF.
     */
    public static void sign(
            CustomPDFDocumentFactory pdfDocumentFactory,
            MultipartFile input,
            OutputStream output,
            CreateSignature instance,
            Boolean showSignature,
            Integer pageNumber,
            String name,
            String location,
            String reason,
            Boolean showLogo)
            throws IOException {
        try (PDDocument doc = pdfDocumentFactory.load(input)) {
            PDSignature signature = new PDSignature();
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
            signature.setName(name);
            signature.setLocation(location);
            signature.setReason(reason);
            signature.setSignDate(Calendar.getInstance()); // PDFBox requires Calendar
            try (SignatureOptions signatureOptions = new SignatureOptions()) {
                signatureOptions.setPreferredSignatureSize(
                        signatureReservation(instance.getCertificateChain()));
                if (Boolean.TRUE.equals(showSignature)) {
                    int pageIndex = resolveSignaturePage(pageNumber, doc.getNumberOfPages());
                    signatureOptions.setVisualSignature(
                            instance.createVisibleSignature(doc, signature, pageIndex, showLogo));
                    signatureOptions.setPage(pageIndex);
                }
                doc.addSignature(signature, instance, signatureOptions);
                makeSignatureWidgetAccessible(doc, signature, instance.signerName());
                doc.saveIncremental(output);
            }
        }
    }

    static int signatureReservation(Certificate[] chain) throws IOException {
        int certificateBytes = 0;
        if (chain != null) {
            try {
                for (Certificate certificate : chain) {
                    certificateBytes += certificate.getEncoded().length;
                }
            } catch (CertificateEncodingException e) {
                throw new IOException("Could not encode the signing certificate chain", e);
            }
        }
        return Math.max(
                SignatureOptions.DEFAULT_SIGNATURE_SIZE, certificateBytes + SIGNER_INFO_ALLOWANCE);
    }

    /**
     * Gives the signature widget, visible or not, what PDF/UA-1 7.18 asks of every widget: a
     * description (/TU and /Contents), structure tab order on its page, and, in a tagged document,
     * a Form structure element that owns it. Incremental saving writes only objects flagged as
     * updated, so every touched object is flagged.
     */
    private static void makeSignatureWidgetAccessible(
            PDDocument doc, PDSignature signature, String signerName) throws IOException {
        PDSignatureField field = findSignatureField(doc, signature);
        if (field == null) {
            return;
        }
        PDAnnotationWidget widget = field.getWidgets().getFirst();
        PDPage page = widget.getPage() != null ? widget.getPage() : doc.getPage(0);
        String description = "Digital signature by " + signerName;
        field.setAlternateFieldName(description);
        widget.setContents(description);
        page.getCOSObject().setName(COSName.getPDFName("Tabs"), "S");
        markUpdated(page.getCOSObject(), field.getCOSObject(), widget.getCOSObject());

        PDStructureTreeRoot root = doc.getDocumentCatalog().getStructureTreeRoot();
        if (root != null) {
            tagSignatureWidget(root, page, widget, description);
        }
    }

    private static PDSignatureField findSignatureField(PDDocument doc, PDSignature signature)
            throws IOException {
        for (PDSignatureField field : doc.getSignatureFields()) {
            if (field.getCOSObject().getDictionaryObject(COSName.V) == signature.getCOSObject()) {
                return field;
            }
        }
        return null;
    }

    private static void tagSignatureWidget(
            PDStructureTreeRoot root, PDPage page, PDAnnotationWidget widget, String description)
            throws IOException {
        int key = parentTreeKey(root);
        PDStructureNode parent = root;
        for (Object kid : root.getKids()) {
            if (kid instanceof PDStructureElement element) {
                parent = element;
                break;
            }
        }
        PDStructureElement form = new PDStructureElement(StandardStructureTypes.FORM, parent);
        form.setPage(page);
        form.setAlternateDescription(description);
        PDObjectReference reference = new PDObjectReference();
        reference.setReferencedObject(widget);
        form.appendKid(reference);
        parent.appendKid(form);

        widget.setStructParent(key);
        addParentTreeEntry(root, key, form);
        root.setParentTreeNextKey(key + 1);

        markUpdated(
                root.getCOSObject(),
                parent.getCOSObject(),
                parent.getCOSObject().getDictionaryObject(COSName.K),
                widget.getCOSObject());
    }

    /**
     * The parent-tree key for a new entry: past every key in use and the root's next key.
     *
     * @throws IllegalArgumentException when no key is left whose successor still fits the
     *     /ParentTreeNextKey integer, checked before anything is changed
     */
    static int parentTreeKey(PDStructureTreeRoot root) throws IOException {
        long key = Math.max(root.getParentTreeNextKey(), nextParentTreeKey(root.getParentTree()));
        if (key >= Integer.MAX_VALUE) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Invalid argument: {0}",
                    "fileInput - the PDF's structure tree has no parent-tree key left for the"
                            + " signature");
        }
        return (int) key;
    }

    private static long nextParentTreeKey(PDNumberTreeNode parentTree) throws IOException {
        if (parentTree == null) {
            return 0;
        }
        long max = -1;
        Map<Integer, COSObjectable> numbers = parentTree.getNumbers();
        if (numbers != null) {
            for (Integer number : numbers.keySet()) {
                max = Math.max(max, number);
            }
        }
        List<PDNumberTreeNode> kids = parentTree.getKids();
        if (kids != null) {
            for (PDNumberTreeNode kid : kids) {
                max = Math.max(max, nextParentTreeKey(kid) - 1);
            }
        }
        return max + 1;
    }

    // Appends past every existing key, so a new leaf at the end of /Kids keeps the tree sorted.
    private static void addParentTreeEntry(
            PDStructureTreeRoot root, int key, PDStructureElement value) {
        PDNumberTreeNode parentTree = root.getParentTree();
        if (parentTree == null) {
            parentTree = new PDNumberTreeNode(COSBase.class);
            root.setParentTree(parentTree);
        }
        COSDictionary treeDict = parentTree.getCOSObject();
        COSArray kids = treeDict.getCOSArray(COSName.KIDS);
        if (kids == null) {
            COSArray nums = treeDict.getCOSArray(COSName.NUMS);
            if (nums == null) {
                nums = new COSArray();
                treeDict.setItem(COSName.NUMS, nums);
            }
            nums.add(COSInteger.get(key));
            nums.add(value);
            markUpdated(treeDict, nums);
            return;
        }
        COSArray nums = new COSArray();
        nums.add(COSInteger.get(key));
        nums.add(value);
        COSArray limits = new COSArray();
        limits.add(COSInteger.get(key));
        limits.add(COSInteger.get(key));
        COSDictionary leaf = new COSDictionary();
        leaf.setItem(COSName.NUMS, nums);
        leaf.setItem(COSName.LIMITS, limits);
        kids.add(leaf);
        markUpdated(treeDict, kids);
    }

    private static void markUpdated(COSBase... objects) {
        for (COSBase object : objects) {
            if (object instanceof COSUpdateInfo updatable) {
                updatable.setNeedToBeUpdated(true);
            }
        }
    }

    // pageNumber is 0-based here and null means the first page, as the UI shows it.
    private static int resolveSignaturePage(Integer pageNumber, int pageCount) {
        int pageIndex = pageNumber == null ? 0 : pageNumber;
        if (pageIndex < 0 || pageIndex >= pageCount) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Invalid argument: {0}",
                    "pageNumber "
                            + (pageIndex + 1)
                            + " - the visible signature needs a page from 1 to "
                            + pageCount);
        }
        return pageIndex;
    }

    @AutoJobPostMapping(
            consumes = {
                MediaType.MULTIPART_FORM_DATA_VALUE,
                MediaType.APPLICATION_FORM_URLENCODED_VALUE
            },
            value = "/cert-sign",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary =
                    "Digitally sign a PDF; certType SERVER uses the server's own certificate. Run"
                            + " last: later edits invalidate it",
            description =
                    "Adds a digital signature to the PDF and returns the signed file. certType"
                            + " SERVER signs with this server's own certificate, so no file or"
                            + " password is needed, and the signer shown is the server's"
                            + " organisation rather than the user. PEM, PKCS12/PFX and JKS sign"
                            + " with an uploaded certificate and key; WINDOWS_STORE, MACOS_KEYCHAIN and"
                            + " PKCS11 work only in the desktop app. Make signing the last change to the file:"
                            + " any later edit (compress, watermark, add a password, flatten and"
                            + " so on) invalidates the signature. Set showSignature to add a"
                            + " visible signature box on pageNumber.")
    public ResponseEntity<Resource> signPDFWithCert(
            @ModelAttribute SignPDFWithCertRequest request, HttpServletRequest httpRequest)
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
        // Unencrypted keys and password-less keystores arrive with no password: use an empty one.
        String keystorePassword = password != null ? password : "";
        Provider signingProvider = null;
        HardwareKeyStoreService.Pkcs11Session pkcs11Session = null;

        switch (certType) {
            case "PEM":
                privateKeyFile =
                        validateFilePresent(
                                privateKeyFile, "PEM private key", "private key file is required");
                certFile =
                        validateFilePresent(
                                certFile, "PEM certificate", "certificate file is required");
                ks = KeyStore.getInstance("JKS");
                ks.load(null);
                PrivateKey privateKey =
                        getPrivateKeyFromPEM(privateKeyFile.getBytes(), keystorePassword);
                Certificate cert = (Certificate) getCertificateFromPEM(certFile.getBytes());
                ks.setKeyEntry(
                        "alias",
                        privateKey,
                        keystorePassword.toCharArray(),
                        new Certificate[] {cert});
                break;
            case "PKCS12":
            case "PFX":
                p12File =
                        validateFilePresent(
                                p12File, "PKCS12 keystore", "PKCS12/PFX keystore file is required");
                ks = KeyStore.getInstance("PKCS12");
                loadKeyStore(ks, p12File, keystorePassword, "PKCS12 keystore");
                break;
            case "JKS":
                jksfile =
                        validateFilePresent(
                                jksfile, "JKS keystore", "JKS keystore file is required");
                ks = KeyStore.getInstance("JKS");
                loadKeyStore(ks, jksfile, keystorePassword, "JKS keystore");
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
            case "WINDOWS_STORE":
                hardwareKeyStoreService.assertLocalDesktop(httpRequest);
                ks = hardwareKeyStoreService.loadWindowsKeyStore();
                signingProvider = hardwareKeyStoreService.windowsProvider();
                // PIN is prompted by the Windows CSP / token middleware, not passed here.
                keystorePassword = password;
                break;
            case "MACOS_KEYCHAIN":
                hardwareKeyStoreService.assertLocalDesktop(httpRequest);
                ks = hardwareKeyStoreService.loadMacKeychain();
                signingProvider = hardwareKeyStoreService.macKeychainProvider();
                // macOS prompts for the card PIN or keychain access itself.
                keystorePassword = null;
                break;
            case "PKCS11":
                hardwareKeyStoreService.assertLocalDesktop(httpRequest);
                char[] pkcs11Pin = password != null ? password.toCharArray() : null;
                try {
                    pkcs11Session =
                            hardwareKeyStoreService.openPkcs11(
                                    request.getPkcs11LibraryPath(),
                                    request.getPkcs11Slot(),
                                    pkcs11Pin);
                } finally {
                    if (pkcs11Pin != null) {
                        java.util.Arrays.fill(pkcs11Pin, '\0');
                    }
                }
                ks = pkcs11Session.keyStore();
                signingProvider = pkcs11Session.provider();
                keystorePassword = password;
                break;
            default:
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidArgument",
                        "Invalid argument: {0}",
                        "certificate type: " + certType);
        }

        char[] pin = keystorePassword != null ? keystorePassword.toCharArray() : null;
        TempFile signedOut;
        try {
            String alias =
                    HardwareKeyStoreService.isHardwareSource(certType)
                            ? hardwareKeyStoreService.resolveSigningAlias(
                                    ks, request.getAlias(), certType)
                            : request.getAlias();
            CreateSignature createSignature = new CreateSignature(ks, pin, alias, signingProvider);
            signedOut = tempFileManager.createManagedTempFile(".pdf");
            try (OutputStream os = new FileOutputStream(signedOut.getFile())) {
                sign(
                        pdfDocumentFactory,
                        pdf,
                        os,
                        createSignature,
                        showSignature,
                        pageNumber,
                        name,
                        location,
                        reason,
                        showLogo);
            } catch (IOException | RuntimeException e) {
                signedOut.close();
                throw e;
            }
        } finally {
            // Clear the PIN copy and log out the token session once signing is done.
            if (pin != null) {
                java.util.Arrays.fill(pin, '\0');
            }
            if (pkcs11Session != null) {
                pkcs11Session.close();
            }
        }
        // Return the signed PDF
        return WebResponseUtils.pdfFileToWebResponse(
                signedOut, GeneralUtils.generateFilename(pdf.getOriginalFilename(), ".pdf"));
    }

    private MultipartFile validateFilePresent(
            MultipartFile file, String argumentName, String errorDescription) {
        if (file == null || file.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Invalid argument: {0}",
                    argumentName + " - " + errorDescription);
        }
        return file;
    }

    // A wrong password surfaces as an IOException caused by UnrecoverableKeyException.
    private static void loadKeyStore(KeyStore ks, MultipartFile file, String password, String label)
            throws IOException, NoSuchAlgorithmException, CertificateException {
        try (InputStream in = file.getInputStream()) {
            ks.load(in, password.toCharArray());
        } catch (IOException e) {
            if (e.getCause() instanceof UnrecoverableKeyException) {
                throw wrongPassword(label);
            }
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Invalid argument: {0}",
                    label + " - the file could not be read as a " + label);
        }
    }

    private static IllegalArgumentException wrongPassword(String label) {
        return ExceptionUtils.createIllegalArgumentException(
                "error.invalidArgument",
                "Invalid argument: {0}",
                "password - the " + label + " password is incorrect or missing");
    }

    private PrivateKey getPrivateKeyFromPEM(byte[] pemBytes, String password)
            throws IOException, OperatorCreationException, PKCSException {
        try (PEMParser pemParser =
                new PEMParser(new InputStreamReader(new ByteArrayInputStream(pemBytes)))) {
            Object pemObject = pemParser.readObject();
            JcaPEMKeyConverter converter = new JcaPEMKeyConverter().setProvider("BC");
            PrivateKeyInfo pkInfo;
            if (pemObject instanceof PKCS8EncryptedPrivateKeyInfo pkcs8EncryptedPrivateKeyInfo) {
                InputDecryptorProvider decProv =
                        new JceOpenSSLPKCS8DecryptorProviderBuilder()
                                .build(requirePemPassword(password));
                try {
                    pkInfo = pkcs8EncryptedPrivateKeyInfo.decryptPrivateKeyInfo(decProv);
                } catch (PKCSException e) {
                    throw wrongPassword("PEM private key");
                }
            } else if (pemObject instanceof PEMEncryptedKeyPair pemEncryptedKeyPair) {
                PEMDecryptorProvider decProv =
                        new JcePEMDecryptorProviderBuilder().build(requirePemPassword(password));
                try {
                    pkInfo = pemEncryptedKeyPair.decryptKeyPair(decProv).getPrivateKeyInfo();
                } catch (IOException e) {
                    throw wrongPassword("PEM private key");
                }
            } else if (pemObject instanceof PEMKeyPair pemKeyPair) {
                pkInfo = pemKeyPair.getPrivateKeyInfo();
            } else if (pemObject instanceof PrivateKeyInfo privateKeyInfo) {
                // Unencrypted PKCS#8 ("BEGIN PRIVATE KEY"), the usual openssl output.
                pkInfo = privateKeyInfo;
            } else {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidArgument",
                        "Invalid argument: {0}",
                        "PEM private key - no private key found in the file");
            }
            return converter.getPrivateKey(pkInfo);
        }
    }

    private static char[] requirePemPassword(String password) {
        if (password == null || password.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Invalid argument: {0}",
                    "PEM private key - the key is encrypted, so its password is required");
        }
        return password.toCharArray();
    }

    private Certificate getCertificateFromPEM(byte[] pemBytes)
            throws IOException, CertificateException {
        try (ByteArrayInputStream bis = new ByteArrayInputStream(pemBytes)) {
            return CertificateFactory.getInstance("X.509").generateCertificate(bis);
        }
    }

    public static class CreateSignature extends CreateSignatureBase {
        File logoFile;

        public CreateSignature(KeyStore keystore, char[] pin)
                throws KeyStoreException,
                        UnrecoverableKeyException,
                        NoSuchAlgorithmException,
                        IOException,
                        CertificateException {
            this(keystore, pin, null, null);
        }

        public CreateSignature(
                KeyStore keystore, char[] pin, String alias, Provider signingProvider)
                throws KeyStoreException,
                        UnrecoverableKeyException,
                        NoSuchAlgorithmException,
                        IOException,
                        CertificateException {
            super(keystore, pin, alias);
            setSigningProvider(signingProvider);
            loadLogo();
        }

        private void loadLogo() throws IOException {
            ClassPathResource resource = new ClassPathResource("static/images/signature.png");
            try (InputStream is = resource.getInputStream()) {
                logoFile = Files.createTempFile("signature", ".png").toFile();
                FileUtils.copyInputStreamToFile(is, logoFile);
            } catch (IOException e) {
                log.error("Failed to load image signature file");
                throw e;
            }
        }

        String signerName() {
            X509Certificate cert = (X509Certificate) getCertificateChain()[0];
            // https://stackoverflow.com/questions/2914521/
            X500Name x500Name = new X500Name(cert.getSubjectX500Principal().getName());
            RDN[] cns = x500Name.getRDNs(BCStyle.CN);
            return cns.length > 0
                    ? IETFUtils.valueToString(cns[0].getFirst().getValue())
                    : cert.getSubjectX500Principal().getName();
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
                PDAnnotationWidget widget = signatureField.getWidgets().getFirst();
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
                SignatureTextWriter text = new SignatureTextWriter(doc);

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
                    cs.setNonStrokingColor(Color.black);
                    cs.newLineAtOffset(fontSize, height - leading);
                    cs.setLeading(leading);

                    String name = signerName();

                    String date = signature.getSignDate().getTime().toString();
                    String reason = signature.getReason();

                    text.showText(cs, "Signed by " + name, fontSize);
                    cs.newLine();
                    text.showText(cs, date, fontSize);
                    if (StringUtils.isNotBlank(reason)) {
                        cs.newLine();
                        text.showText(cs, reason, fontSize);
                    }

                    cs.endText();
                }

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                doc.save(baos);
                return new ByteArrayInputStream(baos.toByteArray());
            }
        }
    }
}
