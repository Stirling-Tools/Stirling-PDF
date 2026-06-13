package stirling.software.proprietary.workflow.dto;

import java.util.ArrayList;
import java.util.List;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;

/**
 * Request object for signing a document. Combines certificate submission data with optional wet
 * signature (visual signature) metadata. Supports multiple wet signatures.
 */
// MIGRATION: bound via @MultipartForm on a multipart @POST (SigningSessionController.signDocument).
// RESTEasy Reactive populates multipart POJOs from @RestForm-annotated FIELDS only (Spring's
// @ModelAttribute bound by property name); the simple String fields are annotated below so
// augmentation succeeds. The file and parsed-list fields remain unbound - see their TODOs.
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SignDocumentRequest {

    // Certificate-related fields
    @RestForm("certType")
    @NotNull(message = "Certificate type is required")
    @Pattern(
            regexp = "SERVER|USER_CERT|UPLOAD|PEM|PKCS12|PFX|JKS",
            message = "Invalid certificate type")
    private String certType;

    // Certificate/key upload parts. RESTEasy Reactive only populates @RestForm FileUpload fields
    // (not the common MultipartFile shim), so they are bound as FileUpload here and adapted back to
    // MultipartFile via the getP12File()/getPrivateKeyFile()/getCertFile() accessors below, leaving
    // the signing service unchanged. The frontend posts these exact part names (p12File for
    // PKCS12/PFX/JKS keystores; privateKeyFile + certFile for PEM).
    @RestForm("p12File")
    private FileUpload p12FileUpload;

    @RestForm("password")
    private String password;

    @RestForm("privateKeyFile")
    private FileUpload privateKeyFileUpload;

    @RestForm("certFile")
    private FileUpload certFileUpload;

    public MultipartFile getP12File() {
        return FileUploadMultipartFile.of(p12FileUpload);
    }

    public MultipartFile getPrivateKeyFile() {
        return FileUploadMultipartFile.of(privateKeyFileUpload);
    }

    public MultipartFile getCertFile() {
        return FileUploadMultipartFile.of(certFileUpload);
    }

    // Signature metadata (participant can override owner defaults)
    @RestForm("reason")
    private String reason; // Participant's reason for signing

    @RestForm("location")
    private String location; // Participant's location when signing

    // Wet signatures as JSON string (from frontend FormData)
    @RestForm("wetSignaturesData")
    private String wetSignaturesData;

    // TODO: Migration required - wetSignatures is a parsed list of POJOs populated by the
    // controller/service from wetSignaturesData, not bound directly from the form; RESTEasy has no
    // converter for WetSignatureMetadata, so it is intentionally left without @RestForm.
    private List<WetSignatureMetadata> wetSignatures;

    /**
     * Checks if this request includes wet signature metadata.
     *
     * @return true if wet signatures list is not empty
     */
    public boolean hasWetSignatures() {
        return wetSignatures != null && !wetSignatures.isEmpty();
    }

    /**
     * Extracts and validates wet signature metadata.
     *
     * @return List of validated WetSignatureMetadata objects
     */
    public List<WetSignatureMetadata> extractWetSignatureMetadata() {
        List<WetSignatureMetadata> signatures = new ArrayList<>();

        if (hasWetSignatures()) {
            for (WetSignatureMetadata signature : wetSignatures) {
                signature.validate();
                signatures.add(signature);
            }
        }

        return signatures;
    }
}
