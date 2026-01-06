package stirling.software.SPDF.model.api.security;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
public class CertStoreEntriesRequest {

    @Schema(
            description = "The type of certificate store to query",
            allowableValues = {"WINDOWS_STORE", "MAC_KEYCHAIN", "PKCS11"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String certType;

    @Schema(description = "PKCS11 configuration file for hardware-backed certificates")
    private MultipartFile pkcs11ConfigFile;

    @Schema(description = "The password or PIN for the certificate store", format = "password")
    private String password;
}
