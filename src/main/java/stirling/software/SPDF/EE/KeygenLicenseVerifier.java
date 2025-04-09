package stirling.software.SPDF.EE;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Base64;

import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters;
import org.bouncycastle.crypto.signers.Ed25519Signer;
import org.bouncycastle.util.encoders.Hex;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.posthog.java.shaded.org.json.JSONException;
import com.posthog.java.shaded.org.json.JSONObject;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.utils.GeneralUtils;

@Service
@Slf4j
public class KeygenLicenseVerifier {

    enum License {
        NORMAL,
        PRO,
        ENTERPRISE
    }

    // License verification configuration
    private static final String ACCOUNT_ID = "e5430f69-e834-4ae4-befd-b602aae5f372";
    private static final String BASE_URL = "https://api.keygen.sh/v1/accounts";

    private static final String PUBLIC_KEY =
            "9fbc0d78593dcfcf03c945146edd60083bf5fae77dbc08aaa3935f03ce94a58d";

    private static final String CERT_PREFIX = "-----BEGIN LICENSE FILE-----";
    private static final String CERT_SUFFIX = "-----END LICENSE FILE-----";

    private static final String JWT_PREFIX = "key/";

    private static final ObjectMapper objectMapper = new ObjectMapper();
    private final ApplicationProperties applicationProperties;

    @Autowired
    public KeygenLicenseVerifier(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    public License verifyLicense(String licenseKeyOrCert) {
        if (isCertificateLicense(licenseKeyOrCert)) {
            log.info("Detected certificate-based license. Processing...");
            return resultToEnum(verifyCertificateLicense(licenseKeyOrCert), License.ENTERPRISE);
        } else if (isJWTLicense(licenseKeyOrCert)) {
            log.info("Detected JWT-style license key. Processing...");
            return resultToEnum(verifyJWTLicense(licenseKeyOrCert), License.ENTERPRISE);
        } else {
            log.info("Detected standard license key. Processing...");
            return resultToEnum(verifyStandardLicense(licenseKeyOrCert), License.PRO);
        }
    }

    private License resultToEnum(boolean result, License option) {
        if (result) {
            return option;
        }
        return License.NORMAL;
    }

    private boolean isCertificateLicense(String license) {
        return license != null && license.trim().startsWith(CERT_PREFIX);
    }

    private boolean isJWTLicense(String license) {
        return license != null && license.trim().startsWith(JWT_PREFIX);
    }

    private boolean verifyCertificateLicense(String licenseFile) {
        try {
            log.info("Verifying certificate-based license");

            String encodedPayload = licenseFile;
            // Remove the header
            encodedPayload = encodedPayload.replace(CERT_PREFIX, "");
            // Remove the footer
            encodedPayload = encodedPayload.replace(CERT_SUFFIX, "");
            // Remove all newlines
            encodedPayload = encodedPayload.replaceAll("\\r?\\n", "");

            byte[] payloadBytes = Base64.getDecoder().decode(encodedPayload);
            String payload = new String(payloadBytes);

            log.info("Decoded certificate payload: {}", payload);

            String encryptedData = "";
            String encodedSignature = "";
            String algorithm = "";

            try {
                JSONObject attrs = new JSONObject(payload);
                encryptedData = (String) attrs.get("enc");
                encodedSignature = (String) attrs.get("sig");
                algorithm = (String) attrs.get("alg");

                log.info("Certificate algorithm: {}", algorithm);
            } catch (JSONException e) {
                log.error("Failed to parse license file: {}", e.getMessage());
                return false;
            }

            // Verify license file algorithm
            if (!algorithm.equals("base64+ed25519")) {
                log.error(
                        "Unsupported algorithm: {}. Only base64+ed25519 is supported.", algorithm);
                return false;
            }

            // Verify signature
            boolean isSignatureValid = verifyEd25519Signature(encryptedData, encodedSignature);
            if (!isSignatureValid) {
                log.error("License file signature is invalid");
                return false;
            }

            log.info("License file signature is valid");

            // Decode the base64 data
            String decodedData;
            try {
                decodedData = new String(Base64.getDecoder().decode(encryptedData));
            } catch (IllegalArgumentException e) {
                log.error("Failed to decode license data: {}", e.getMessage());
                return false;
            }

            // Process the certificate data
            boolean isValid = processCertificateData(decodedData);

            return isValid;
        } catch (Exception e) {
            log.error("Error verifying certificate license: {}", e.getMessage(), e);
            return false;
        }
    }

    private boolean verifyEd25519Signature(String encryptedData, String encodedSignature) {
        try {
            log.info("Signature to verify: {}", encodedSignature);
            log.info("Public key being used: {}", PUBLIC_KEY);

            byte[] signatureBytes = Base64.getDecoder().decode(encodedSignature);

            // Create the signing data format - prefix with "license/"
            String signingData = String.format("license/%s", encryptedData);
            byte[] signingDataBytes = signingData.getBytes();

            log.info("Signing data length: {} bytes", signingDataBytes.length);

            byte[] publicKeyBytes = Hex.decode(PUBLIC_KEY);

            Ed25519PublicKeyParameters verifierParams =
                    new Ed25519PublicKeyParameters(publicKeyBytes, 0);
            Ed25519Signer verifier = new Ed25519Signer();

            verifier.init(false, verifierParams);
            verifier.update(signingDataBytes, 0, signingDataBytes.length);

            // Verify the signature
            boolean result = verifier.verifySignature(signatureBytes);
            if (!result) {
                log.error("Signature verification failed with standard public key");
            }

            return result;
        } catch (Exception e) {
            log.error("Error verifying Ed25519 signature: {}", e.getMessage(), e);
            return false;
        }
    }

    private boolean processCertificateData(String certData) {
        try {
            log.info("Processing certificate data: {}", certData);

            JSONObject licenseData = new JSONObject(certData);
            JSONObject metaObj = licenseData.optJSONObject("meta");
            if (metaObj != null) {
                String issuedStr = metaObj.optString("issued", null);
                String expiryStr = metaObj.optString("expiry", null);

                if (issuedStr != null && expiryStr != null) {
                    java.time.Instant issued = java.time.Instant.parse(issuedStr);
                    java.time.Instant expiry = java.time.Instant.parse(expiryStr);
                    java.time.Instant now = java.time.Instant.now();

                    if (issued.isAfter(now)) {
                        log.error(
                                "License file issued date is in the future. Please adjust system time or request a new license");
                        return false;
                    }

                    // Check if the license file has expired
                    if (expiry.isBefore(now)) {
                        log.error("License file has expired on {}", expiryStr);
                        return false;
                    }

                    log.info("License file valid until {}", expiryStr);
                }
            }

            // Get the main license data
            JSONObject dataObj = licenseData.optJSONObject("data");
            if (dataObj == null) {
                log.error("No data object found in certificate");
                return false;
            }

            // Extract license or machine information
            JSONObject attributesObj = dataObj.optJSONObject("attributes");
            if (attributesObj != null) {
                log.info("Found attributes in certificate data");

                // Extract metadata
                JSONObject metadataObj = attributesObj.optJSONObject("metadata");
                if (metadataObj != null) {
                    int users = metadataObj.optInt("users", 0);
                    if (users > 0) {
                        applicationProperties.getPremium().setMaxUsers(users);
                        log.info("License allows for {} users", users);
                    }
                }

                // Check maxUsers directly in attributes if present from policy definition
                //                if (attributesObj.has("maxUsers")) {
                //                    int maxUsers = attributesObj.optInt("maxUsers", 0);
                //                    if (maxUsers > 0) {
                //                        applicationProperties.getPremium().setMaxUsers(maxUsers);
                //                        log.info("License directly specifies {} max users",
                // maxUsers);
                //                    }
                //                }

                // Check license status if available
                String status = attributesObj.optString("status", null);
                if (status != null
                        && !status.equals("ACTIVE")
                        && !status.equals("EXPIRING")) { // Accept "EXPIRING" status as valid
                    log.error("License status is not active: {}", status);
                    return false;
                }
            }

            return true;
        } catch (Exception e) {
            log.error("Error processing certificate data: {}", e.getMessage(), e);
            return false;
        }
    }

    private boolean verifyJWTLicense(String licenseKey) {
        try {
            log.info("Verifying ED25519_SIGN format license key");

            // Remove the "key/" prefix
            String licenseData = licenseKey.substring(JWT_PREFIX.length());

            // Split into payload and signature
            String[] parts = licenseData.split("\\.", 2);
            if (parts.length != 2) {
                log.error(
                        "Invalid ED25519_SIGN license format. Expected format: key/payload.signature");
                return false;
            }

            String encodedPayload = parts[0];
            String encodedSignature = parts[1];

            // Verify signature
            boolean isSignatureValid = verifyJWTSignature(encodedPayload, encodedSignature);
            if (!isSignatureValid) {
                log.error("ED25519_SIGN license signature is invalid");
                return false;
            }

            log.info("ED25519_SIGN license signature is valid");

            // Decode and process payload - first convert from URL-safe base64 if needed
            String base64Payload = encodedPayload.replace('-', '+').replace('_', '/');
            byte[] payloadBytes = Base64.getDecoder().decode(base64Payload);
            String payload = new String(payloadBytes);

            // Process the license payload
            boolean isValid = processJWTLicensePayload(payload);

            return isValid;
        } catch (Exception e) {
            log.error("Error verifying ED25519_SIGN license: {}", e.getMessage());
            return false;
        }
    }

    private boolean verifyJWTSignature(String encodedPayload, String encodedSignature) {
        try {
            // Decode base64 signature
            byte[] signatureBytes =
                    Base64.getDecoder()
                            .decode(encodedSignature.replace('-', '+').replace('_', '/'));

            // For ED25519_SIGN format, the signing data is "key/" + encodedPayload
            String signingData = String.format("key/%s", encodedPayload);
            byte[] dataBytes = signingData.getBytes();

            byte[] publicKeyBytes = Hex.decode(PUBLIC_KEY);
            Ed25519PublicKeyParameters verifierParams =
                    new Ed25519PublicKeyParameters(publicKeyBytes, 0);
            Ed25519Signer verifier = new Ed25519Signer();

            verifier.init(false, verifierParams);
            verifier.update(dataBytes, 0, dataBytes.length);

            // Verify the signature
            return verifier.verifySignature(signatureBytes);
        } catch (Exception e) {
            log.error("Error verifying JWT signature: {}", e.getMessage());
            return false;
        }
    }

    private boolean processJWTLicensePayload(String payload) {
        try {
            log.info("Processing license payload: {}", payload);

            JSONObject licenseData = new JSONObject(payload);

            JSONObject licenseObj = licenseData.optJSONObject("license");
            if (licenseObj == null) {
                String id = licenseData.optString("id", null);
                if (id != null) {
                    log.info("Found license ID: {}", id);
                    licenseObj = licenseData; // Use the root object as the license object
                } else {
                    log.error("License data not found in payload");
                    return false;
                }
            }

            String licenseId = licenseObj.optString("id", "unknown");
            log.info("Processing license with ID: {}", licenseId);

            // Check expiry date
            String expiryStr = licenseObj.optString("expiry", null);
            if (expiryStr != null && !expiryStr.equals("null")) {
                java.time.Instant expiry = java.time.Instant.parse(expiryStr);
                java.time.Instant now = java.time.Instant.now();

                if (now.isAfter(expiry)) {
                    log.error("License has expired on {}", expiryStr);
                    return false;
                }

                log.info("License valid until {}", expiryStr);
            } else {
                log.info("License has no expiration date");
            }

            // Extract account, product, policy info
            JSONObject accountObj = licenseData.optJSONObject("account");
            if (accountObj != null) {
                String accountId = accountObj.optString("id", "unknown");
                log.info("License belongs to account: {}", accountId);

                // Verify this matches your expected account ID
                if (!ACCOUNT_ID.equals(accountId)) {
                    log.warn("License account ID does not match expected account ID");
                    // You might want to fail verification here depending on your requirements
                }
            }

            // Extract policy information if available
            JSONObject policyObj = licenseData.optJSONObject("policy");
            if (policyObj != null) {
                String policyId = policyObj.optString("id", "unknown");
                log.info("License uses policy: {}", policyId);

                // Extract max users from policy if available (customize based on your policy
                // structure)
                int users = policyObj.optInt("users", 0);
                if (users > 0) {
                    applicationProperties.getPremium().setMaxUsers(users);
                    log.info("License allows for {} users", users);
                } else {
                    // Try to get users from metadata if present
                    Object metadataObj = policyObj.opt("metadata");
                    if (metadataObj instanceof JSONObject) {
                        JSONObject metadata = (JSONObject) metadataObj;
                        users = metadata.optInt("users", 1);
                        applicationProperties.getPremium().setMaxUsers(users);
                        log.info("License allows for {} users (from metadata)", users);
                    } else {
                        // Default value
                        applicationProperties.getPremium().setMaxUsers(1);
                        log.info("Using default of 1 user for license");
                    }
                }
            }

            return true;
        } catch (Exception e) {
            log.error("Error processing license payload: {}", e.getMessage(), e);
            return false;
        }
    }

    private boolean verifyStandardLicense(String licenseKey) {
        try {
            log.info("Checking standard license key");
            String machineFingerprint = generateMachineFingerprint();

            // First, try to validate the license
            JsonNode validationResponse = validateLicense(licenseKey, machineFingerprint);
            if (validationResponse != null) {
                boolean isValid = validationResponse.path("meta").path("valid").asBoolean();
                String licenseId = validationResponse.path("data").path("id").asText();
                if (!isValid) {
                    String code = validationResponse.path("meta").path("code").asText();
                    log.info(code);
                    if ("NO_MACHINE".equals(code)
                            || "NO_MACHINES".equals(code)
                            || "FINGERPRINT_SCOPE_MISMATCH".equals(code)) {
                        log.info(
                                "License not activated for this machine. Attempting to activate...");
                        boolean activated =
                                activateMachine(licenseKey, licenseId, machineFingerprint);
                        if (activated) {
                            // Revalidate after activation
                            validationResponse = validateLicense(licenseKey, machineFingerprint);
                            isValid =
                                    validationResponse != null
                                            && validationResponse
                                                    .path("meta")
                                                    .path("valid")
                                                    .asBoolean();
                        }
                    }
                }
                return isValid;
            }

            return false;
        } catch (Exception e) {
            log.error("Error verifying standard license: {}", e.getMessage());
            return false;
        }
    }

    private JsonNode validateLicense(String licenseKey, String machineFingerprint)
            throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        String requestBody =
                String.format(
                        "{\"meta\":{\"key\":\"%s\",\"scope\":{\"fingerprint\":\"%s\"}}}",
                        licenseKey, machineFingerprint);
        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(
                                URI.create(
                                        BASE_URL
                                                + "/"
                                                + ACCOUNT_ID
                                                + "/licenses/actions/validate-key"))
                        .header("Content-Type", "application/vnd.api+json")
                        .header("Accept", "application/vnd.api+json")
                        // .header("Authorization", "License " + licenseKey)
                        .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                        .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        log.info("ValidateLicenseResponse body: {}", response.body());
        JsonNode jsonResponse = objectMapper.readTree(response.body());
        if (response.statusCode() == 200) {
            JsonNode metaNode = jsonResponse.path("meta");
            boolean isValid = metaNode.path("valid").asBoolean();

            String detail = metaNode.path("detail").asText();
            String code = metaNode.path("code").asText();

            log.info("License validity: " + isValid);
            log.info("Validation detail: " + detail);
            log.info("Validation code: " + code);

            int users =
                    jsonResponse
                            .path("data")
                            .path("attributes")
                            .path("metadata")
                            .path("users")
                            .asInt(0);
            applicationProperties.getPremium().setMaxUsers(users);
            log.info(applicationProperties.toString());

        } else {
            log.error("Error validating license. Status code: {}", response.statusCode());
        }
        return jsonResponse;
    }

    private boolean activateMachine(String licenseKey, String licenseId, String machineFingerprint)
            throws Exception {
        HttpClient client = HttpClient.newHttpClient();

        String hostname;
        try {
            hostname = java.net.InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            hostname = "Unknown";
        }

        JSONObject body =
                new JSONObject()
                        .put(
                                "data",
                                new JSONObject()
                                        .put("type", "machines")
                                        .put(
                                                "attributes",
                                                new JSONObject()
                                                        .put("fingerprint", machineFingerprint)
                                                        .put(
                                                                "platform",
                                                                System.getProperty("os.name"))
                                                        .put("name", hostname))
                                        .put(
                                                "relationships",
                                                new JSONObject()
                                                        .put(
                                                                "license",
                                                                new JSONObject()
                                                                        .put(
                                                                                "data",
                                                                                new JSONObject()
                                                                                        .put(
                                                                                                "type",
                                                                                                "licenses")
                                                                                        .put(
                                                                                                "id",
                                                                                                licenseId)))));

        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create(BASE_URL + "/" + ACCOUNT_ID + "/machines"))
                        .header("Content-Type", "application/vnd.api+json")
                        .header("Accept", "application/vnd.api+json")
                        .header("Authorization", "License " + licenseKey)
                        .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                        .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        log.info("activateMachine Response body: " + response.body());
        if (response.statusCode() == 201) {
            log.info("Machine activated successfully");
            return true;
        } else {
            log.error(
                    "Error activating machine. Status code: {}, error: {}",
                    response.statusCode(),
                    response.body());

            return false;
        }
    }

    private String generateMachineFingerprint() {
        return GeneralUtils.generateMachineFingerprint();
    }
}
