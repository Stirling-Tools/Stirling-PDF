package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.security.KeyFactory;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Security;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.PKCS8EncodedKeySpec;
import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;

import org.apache.commons.io.IOUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.ExternalSigningSupport;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.CMSSignedDataGenerator;
import org.bouncycastle.cms.CMSTypedData;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;
import org.bouncycastle.util.io.pem.PemReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.model.api.security.SignPDFWithCertRequest;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "Security", description = "Security APIs")
public class CertSignController {

	private static final Logger logger = LoggerFactory.getLogger(CertSignController.class);

	static {
		Security.addProvider(new BouncyCastleProvider());
	}

	@PostMapping(consumes = "multipart/form-data", value = "/cert-sign")
	@Operation(summary = "Sign PDF with a Digital Certificate", description = "This endpoint accepts a PDF file, a digital certificate and related information to sign the PDF. It then returns the digitally signed PDF file. Input:PDF Output:PDF Type:MF-SISO")
	public ResponseEntity<byte[]> signPDFWithCert(@ModelAttribute SignPDFWithCertRequest request) throws Exception {
	    MultipartFile pdf = request.getFileInput();
	    String certType = request.getCertType();
	    MultipartFile privateKeyFile = request.getPrivateKeyFile();
	    MultipartFile certFile = request.getCertFile();
	    MultipartFile p12File = request.getP12File();
	    String password = request.getPassword();
	    Boolean showSignature = request.getShowSignature();
	    String reason = request.getReason();
	    String location = request.getLocation();
	    String name = request.getName();
	    Integer pageNumber = request.getPageNumber();

		PrivateKey privateKey = null;
		X509Certificate cert = null;

		if (certType != null) {
			logger.info("Cert type provided: {}", certType);
			switch (certType) {
			case "PKCS12":
				if (p12File != null) {
					KeyStore ks = KeyStore.getInstance("PKCS12");
					ks.load(new ByteArrayInputStream(p12File.getBytes()), password.toCharArray());
					String alias = ks.aliases().nextElement();
					if (!ks.isKeyEntry(alias)) {
						throw new IllegalArgumentException("The provided PKCS12 file does not contain a private key.");
					}
					privateKey = (PrivateKey) ks.getKey(alias, password.toCharArray());
					cert = (X509Certificate) ks.getCertificate(alias);
				}
				break;
			case "PEM":
				if (privateKeyFile != null && certFile != null) {
					// Load private key
					KeyFactory keyFactory = KeyFactory.getInstance("RSA", BouncyCastleProvider.PROVIDER_NAME);
					if (isPEM(privateKeyFile.getBytes())) {
						privateKey = keyFactory
								.generatePrivate(new PKCS8EncodedKeySpec(parsePEM(privateKeyFile.getBytes())));
					} else {
						privateKey = keyFactory.generatePrivate(new PKCS8EncodedKeySpec(privateKeyFile.getBytes()));
					}

					// Load certificate
					CertificateFactory certFactory = CertificateFactory.getInstance("X.509",
							BouncyCastleProvider.PROVIDER_NAME);
					if (isPEM(certFile.getBytes())) {
						cert = (X509Certificate) certFactory
								.generateCertificate(new ByteArrayInputStream(parsePEM(certFile.getBytes())));
					} else {
						cert = (X509Certificate) certFactory
								.generateCertificate(new ByteArrayInputStream(certFile.getBytes()));
					}
				}
				break;
			}
		}
		PDSignature signature = new PDSignature();
		signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE); // default filter
		signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_SHA1);
		signature.setName(name);
		signature.setLocation(location);
		signature.setReason(reason);

		// Load the PDF
		try (PDDocument document = PDDocument.load(pdf.getBytes())) {
			logger.info("Successfully loaded the provided PDF");
			SignatureOptions signatureOptions = new SignatureOptions();

			// If you want to show the signature

			// ATTEMPT 2
			if (showSignature != null && showSignature) {
				PDPage page = document.getPage(pageNumber - 1);

				PDAcroForm acroForm = document.getDocumentCatalog().getAcroForm();
				if (acroForm == null) {
					acroForm = new PDAcroForm(document);
					document.getDocumentCatalog().setAcroForm(acroForm);
				}

				// Create a new signature field and widget

				PDSignatureField signatureField = new PDSignatureField(acroForm);
				PDAnnotationWidget widget = signatureField.getWidgets().get(0);
				PDRectangle rect = new PDRectangle(100, 100, 200, 50); // Define the rectangle size here
				widget.setRectangle(rect);
				page.getAnnotations().add(widget);

// Set the appearance for the signature field
				PDAppearanceDictionary appearanceDict = new PDAppearanceDictionary();
				PDAppearanceStream appearanceStream = new PDAppearanceStream(document);
				appearanceStream.setResources(new PDResources());
				appearanceStream.setBBox(rect);
				appearanceDict.setNormalAppearance(appearanceStream);
				widget.setAppearance(appearanceDict);

				try (PDPageContentStream contentStream = new PDPageContentStream(document, appearanceStream)) {
					contentStream.beginText();
					contentStream.setFont(PDType1Font.HELVETICA_BOLD, 12);
					contentStream.newLineAtOffset(110, 130);
					contentStream.showText("Digitally signed by: " + (name != null ? name : "Unknown"));
					contentStream.newLineAtOffset(0, -15);
					contentStream.showText("Date: " + new SimpleDateFormat("yyyy.MM.dd HH:mm:ss z").format(new Date()));
					contentStream.newLineAtOffset(0, -15);
					if (reason != null && !reason.isEmpty()) {
						contentStream.showText("Reason: " + reason);
						contentStream.newLineAtOffset(0, -15);
					}
					if (location != null && !location.isEmpty()) {
						contentStream.showText("Location: " + location);
						contentStream.newLineAtOffset(0, -15);
					}
					contentStream.endText();
				}

				// Add the widget annotation to the page
				page.getAnnotations().add(widget);

				// Add the signature field to the acroform
				acroForm.getFields().add(signatureField);

				// Handle multiple signatures by ensuring a unique field name
				String baseFieldName = "Signature";
				String signatureFieldName = baseFieldName;
				int suffix = 1;
				while (acroForm.getField(signatureFieldName) != null) {
					suffix++;
					signatureFieldName = baseFieldName + suffix;
				}
				signatureField.setPartialName(signatureFieldName);
			}
			
			document.addSignature(signature, signatureOptions);
			logger.info("Signature added to the PDF document");
			// External signing
			ExternalSigningSupport externalSigning = document
					.saveIncrementalForExternalSigning(new ByteArrayOutputStream());

			byte[] content = IOUtils.toByteArray(externalSigning.getContent());

			// Using BouncyCastle to sign
			CMSTypedData cmsData = new CMSProcessableByteArray(content);

			CMSSignedDataGenerator gen = new CMSSignedDataGenerator();
			ContentSigner signer = new JcaContentSignerBuilder("SHA256withRSA")
					.setProvider(BouncyCastleProvider.PROVIDER_NAME).build(privateKey);

			gen.addSignerInfoGenerator(new JcaSignerInfoGeneratorBuilder(
					new JcaDigestCalculatorProviderBuilder().setProvider(BouncyCastleProvider.PROVIDER_NAME).build())
					.build(signer, cert));

			gen.addCertificates(new JcaCertStore(Collections.singletonList(cert)));
			CMSSignedData signedData = gen.generate(cmsData, false);

			byte[] cmsSignature = signedData.getEncoded();
			logger.info("About to sign content using BouncyCastle");
			externalSigning.setSignature(cmsSignature);
			logger.info("Signature set successfully");

			// After setting the signature, return the resultant PDF
			try (ByteArrayOutputStream signedPdfOutput = new ByteArrayOutputStream()) {
				document.save(signedPdfOutput);
				return WebResponseUtils.boasToWebResponse(signedPdfOutput,
						pdf.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_signed.pdf");

			} catch (Exception e) {
				e.printStackTrace();
			}
		} catch (Exception e) {
			e.printStackTrace();
		}

		return null;
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
