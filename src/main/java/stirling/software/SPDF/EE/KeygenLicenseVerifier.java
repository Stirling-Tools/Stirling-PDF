package stirling.software.SPDF.EE;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Base64;

import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters;
import org.bouncycastle.crypto.signers.Ed25519Signer;
import org.bouncycastle.util.encoders.Hex;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.posthog.java.shaded.org.json.JSONException;
import com.posthog.java.shaded.org.json.JSONObject;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.utils.GeneralUtils;

@Service
@Slf4j
@RequiredArgsConstructor
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

    // Shared HTTP client for connection pooling
    private static final HttpClient httpClient =
            HttpClient.newBuilder()
                    .version(HttpClient.Version.HTTP_2)
                    .connectTimeout(java.time.Duration.ofSeconds(10))
                    .build();

    // License metadata context class to avoid shared mutable state
    private static class LicenseContext {
        private boolean isFloatingLicense = false;
        private int maxMachines = 1; // Default to 1 if not specified
        private boolean isEnterpriseLicense = false;

        public LicenseContext() {}
    }

    public License verifyLicense(String licenseKeyOrCert) {
        License license;
        LicenseContext context = new LicenseContext();

        if (isCertificateLicense(licenseKeyOrCert)) {
            log.info("Detected certificate-based license. Processing...");
            boolean isValid = verifyCertificateLicense(licenseKeyOrCert, context);
            if (isValid) {
                license = context.isEnterpriseLicense ? License.ENTERPRISE : License.PRO;
            } else {
                license = License.NORMAL;
            }
        } else if (isJWTLicense(licenseKeyOrCert)) {
            log.info("Detected JWT-style license key. Processing...");
            boolean isValid = verifyJWTLicense(licenseKeyOrCert, context);
            if (isValid) {
                license = context.isEnterpriseLicense ? License.ENTERPRISE : License.PRO;
            } else {
                license = License.NORMAL;
            }
        } else {
            log.info("Detected standard license key. Processing...");
            boolean isValid = verifyStandardLicense(licenseKeyOrCert, context);
            if (isValid) {
                license = context.isEnterpriseLicense ? License.ENTERPRISE : License.PRO;
            } else {
                license = License.NORMAL;
            }
        }
        return license;
    }

    // Removed instance field for isEnterpriseLicense, now using LicenseContext

    private boolean isCertificateLicense(String license) {
        return license != null && license.trim().startsWith(CERT_PREFIX);
    }

    private boolean isJWTLicense(String license) {
        return license != null && license.trim().startsWith(JWT_PREFIX);
    }

    private boolean verifyCertificateLicense(String licenseFile, LicenseContext context) {
        try {
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
            } catch (JSONException e) {
                log.error("Failed to parse license file: {}", e.getMessage());
                return false;
            }

            // Verify license file algorithm
            if (!"base64+ed25519".equals(algorithm)) {
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
            boolean isValid = processCertificateData(decodedData, context);

            return isValid;
        } catch (Exception e) {
            log.error("Error verifying certificate license: {}", e.getMessage(), e);
            return false;
        }
    }

    private boolean verifyEd25519Signature(String encryptedData, String encodedSignature) {
        try {
            log.info("Signature to verify: {}", encodedSignature);

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

    private boolean processCertificateData(String certData, LicenseContext context) {
        try {
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
                                "License file issued date is in the future. Please adjust system"
                                        + " time or request a new license");
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

                // Check for floating license
                context.isFloatingLicense = attributesObj.optBoolean("floating", false);
                context.maxMachines = attributesObj.optInt("maxMachines", 1);

                // Extract metadata
                JSONObject metadataObj = attributesObj.optJSONObject("metadata");
                if (metadataObj != null) {
                    int users = metadataObj.optInt("users", 1);
                    applicationProperties.getPremium().setMaxUsers(users);
                    log.info("License allows for {} users", users);
                    context.isEnterpriseLicense = metadataObj.optBoolean("isEnterprise", false);
                }

                // Check license status if available
                String status = attributesObj.optString("status", null);
                if (status != null
                        && !"ACTIVE".equals(status)
                        && !"EXPIRING".equals(status)) { // Accept "EXPIRING" status as valid
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

    private boolean verifyJWTLicense(String licenseKey, LicenseContext context) {
        try {
            log.info("Verifying ED25519_SIGN format license key");

            // Remove the "key/" prefix
            String licenseData = licenseKey.substring(JWT_PREFIX.length());

            // Split into payload and signature
            String[] parts = licenseData.split("\\.", 2);
            if (parts.length != 2) {
                log.error(
                        "Invalid ED25519_SIGN license format. Expected format:"
                                + " key/payload.signature");
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
            boolean isValid = processJWTLicensePayload(payload, context);

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

    private boolean processJWTLicensePayload(String payload, LicenseContext context) {
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

            // Check for floating license in license object
            context.isFloatingLicense = licenseObj.optBoolean("floating", false);
            context.maxMachines = licenseObj.optInt("maxMachines", 1);
            if (context.isFloatingLicense) {
                log.info("Detected floating license with max machines: {}", context.maxMachines);
            }

            // Check expiry date
            String expiryStr = licenseObj.optString("expiry", null);
            if (expiryStr != null && !"null".equals(expiryStr)) {
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

                // Check for floating license in policy
                boolean policyFloating = policyObj.optBoolean("floating", false);
                int policyMaxMachines = policyObj.optInt("maxMachines", 1);

                // Policy settings take precedence
                if (policyFloating) {
                    context.isFloatingLicense = true;
                    context.maxMachines = policyMaxMachines;
                    log.info(
                            "Policy defines floating license with max machines: {}",
                            context.maxMachines);
                }

                // Extract max users and isEnterprise from policy or metadata
                int users = policyObj.optInt("users", 1);
                context.isEnterpriseLicense = policyObj.optBoolean("isEnterprise", false);

                if (users > 0) {
                    applicationProperties.getPremium().setMaxUsers(users);
                    log.info("License allows for {} users", users);
                } else {
                    // Try to get users from metadata if present
                    Object metadataObj = policyObj.opt("metadata");
                    if (metadataObj instanceof JSONObject metadata) {
                        users = metadata.optInt("users", 1);
                        applicationProperties.getPremium().setMaxUsers(users);
                        log.info("License allows for {} users (from metadata)", users);

                        // Check for isEnterprise flag in metadata
                        context.isEnterpriseLicense = metadata.optBoolean("isEnterprise", false);
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

    private boolean verifyStandardLicense(String licenseKey, LicenseContext context) {
        try {
            log.info("Checking standard license key");
            String machineFingerprint = generateMachineFingerprint();

            // First, try to validate the license
            JsonNode validationResponse = validateLicense(licenseKey, machineFingerprint, context);
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
                                "License not activated for this machine. Attempting to"
                                        + " activate...");
                        boolean activated =
                                activateMachine(licenseKey, licenseId, machineFingerprint, context);
                        if (activated) {
                            // Revalidate after activation
                            validationResponse =
                                    validateLicense(licenseKey, machineFingerprint, context);
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

    private JsonNode validateLicense(
            String licenseKey, String machineFingerprint, LicenseContext context) throws Exception {
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

        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());
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

            // Check if the license itself has floating attribute
            JsonNode licenseAttrs = jsonResponse.path("data").path("attributes");
            if (!licenseAttrs.isMissingNode()) {
                context.isFloatingLicense = licenseAttrs.path("floating").asBoolean(false);
                context.maxMachines = licenseAttrs.path("maxMachines").asInt(1);

                log.info(
                        "License floating (from license): {}, maxMachines: {}",
                        context.isFloatingLicense,
                        context.maxMachines);
            }

            // Also check the policy for floating license support if included
            JsonNode includedNode = jsonResponse.path("included");
            JsonNode policyNode = null;

            if (includedNode.isArray()) {
                for (JsonNode node : includedNode) {
                    if ("policies".equals(node.path("type").asText())) {
                        policyNode = node;
                        break;
                    }
                }
            }

            if (policyNode != null) {
                // Check if this is a floating license from policy
                boolean policyFloating =
                        policyNode.path("attributes").path("floating").asBoolean(false);
                int policyMaxMachines = policyNode.path("attributes").path("maxMachines").asInt(1);

                // Policy takes precedence over license attributes
                if (policyFloating) {
                    context.isFloatingLicense = true;
                    context.maxMachines = policyMaxMachines;
                }

                log.info(
                        "License floating (from policy): {}, maxMachines: {}",
                        context.isFloatingLicense,
                        context.maxMachines);
            }

            // Extract user count, default to 1 if not specified
            int users =
                    jsonResponse
                            .path("data")
                            .path("attributes")
                            .path("metadata")
                            .path("users")
                            .asInt(1);
            applicationProperties.getPremium().setMaxUsers(users);

            // Extract isEnterprise flag
            context.isEnterpriseLicense =
                    jsonResponse
                            .path("data")
                            .path("attributes")
                            .path("metadata")
                            .path("isEnterprise")
                            .asBoolean(false);

            log.info(applicationProperties.toString());

        } else {
            log.error("Error validating license. Status code: {}", response.statusCode());
        }
        return jsonResponse;
    }

    private boolean activateMachine(
            String licenseKey, String licenseId, String machineFingerprint, LicenseContext context)
            throws Exception {
        // For floating licenses, we first need to check if we need to deregister any machines
        if (context.isFloatingLicense) {
            log.info(
                    "Processing floating license activation. Max machines allowed: {}",
                    context.maxMachines);

            // Get the current machines for this license
            JsonNode machinesResponse = fetchMachinesForLicense(licenseKey, licenseId);
            if (machinesResponse != null) {
                JsonNode machines = machinesResponse.path("data");
                int currentMachines = machines.size();

                log.info(
                        "Current machine count: {}, Max allowed: {}",
                        currentMachines,
                        context.maxMachines);

                // Check if the current fingerprint is already activated
                boolean isCurrentMachineActivated = false;
                String currentMachineId = null;

                for (JsonNode machine : machines) {
                    if (machineFingerprint.equals(
                            machine.path("attributes").path("fingerprint").asText())) {
                        isCurrentMachineActivated = true;
                        currentMachineId = machine.path("id").asText();
                        log.info(
                                "Current machine is already activated with ID: {}",
                                currentMachineId);
                        break;
                    }
                }

                // If the current machine is already activated, there's no need to do anything
                if (isCurrentMachineActivated) {
                    log.info("Machine already activated. No action needed.");
                    return true;
                }

                // If we've reached the max machines limit, we need to deregister the oldest machine
                if (currentMachines >= context.maxMachines) {
                    log.info(
                            "Max machines reached. Deregistering oldest machine to make room for the new machine.");

                    // Find the oldest machine based on creation timestamp
                    if (machines.size() > 0) {
                        // Find the machine with the oldest creation date
                        String oldestMachineId = null;
                        java.time.Instant oldestTime = null;

                        for (JsonNode machine : machines) {
                            String createdStr =
                                    machine.path("attributes").path("created").asText(null);
                            if (createdStr != null && !createdStr.isEmpty()) {
                                try {
                                    java.time.Instant createdTime =
                                            java.time.Instant.parse(createdStr);
                                    if (oldestTime == null || createdTime.isBefore(oldestTime)) {
                                        oldestTime = createdTime;
                                        oldestMachineId = machine.path("id").asText();
                                    }
                                } catch (Exception e) {
                                    log.warn(
                                            "Could not parse creation time for machine: {}",
                                            e.getMessage());
                                }
                            }
                        }

                        // If we couldn't determine the oldest by timestamp, use the first one
                        if (oldestMachineId == null) {
                            log.warn(
                                    "Could not determine oldest machine by timestamp, using first machine in list");
                            oldestMachineId = machines.path(0).path("id").asText();
                        }

                        log.info("Deregistering machine with ID: {}", oldestMachineId);

                        boolean deregistered = deregisterMachine(licenseKey, oldestMachineId);
                        if (!deregistered) {
                            log.error(
                                    "Failed to deregister machine. Cannot proceed with activation.");
                            return false;
                        }
                        log.info(
                                "Machine deregistered successfully. Proceeding with activation of new machine.");
                    } else {
                        log.error(
                                "License has reached machine limit but no machines were found to deregister. This is unexpected.");
                        // We'll still try to activate, but it might fail
                    }
                }
            }
        }

        // Proceed with machine activation
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

        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());
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

    /**
     * Fetches all machines associated with a specific license
     *
     * @param licenseKey The license key to check
     * @param licenseId The license ID
     * @return JsonNode containing the list of machines, or null if an error occurs
     * @throws Exception if an error occurs during the HTTP request
     */
    private JsonNode fetchMachinesForLicense(String licenseKey, String licenseId) throws Exception {
        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(
                                URI.create(
                                        BASE_URL
                                                + "/"
                                                + ACCOUNT_ID
                                                + "/licenses/"
                                                + licenseId
                                                + "/machines"))
                        .header("Content-Type", "application/vnd.api+json")
                        .header("Accept", "application/vnd.api+json")
                        .header("Authorization", "License " + licenseKey)
                        .GET()
                        .build();

        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        log.info("fetchMachinesForLicense Response body: {}", response.body());

        if (response.statusCode() == 200) {
            return objectMapper.readTree(response.body());
        } else {
            log.error(
                    "Error fetching machines for license. Status code: {}, error: {}",
                    response.statusCode(),
                    response.body());
            return null;
        }
    }

    /**
     * Deregisters a machine from a license
     *
     * @param licenseKey The license key
     * @param machineId The ID of the machine to deregister
     * @return true if deregistration was successful, false otherwise
     */
    private boolean deregisterMachine(String licenseKey, String machineId) {
        try {
            HttpRequest request =
                    HttpRequest.newBuilder()
                            .uri(URI.create(BASE_URL + "/" + ACCOUNT_ID + "/machines/" + machineId))
                            .header("Content-Type", "application/vnd.api+json")
                            .header("Accept", "application/vnd.api+json")
                            .header("Authorization", "License " + licenseKey)
                            .DELETE()
                            .build();

            HttpResponse<String> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 204) {
                log.info("Machine {} successfully deregistered", machineId);
                return true;
            } else {
                log.error(
                        "Error deregistering machine. Status code: {}, error: {}",
                        response.statusCode(),
                        response.body());
                return false;
            }
        } catch (Exception e) {
            log.error("Exception during machine deregistration: {}", e.getMessage(), e);
            return false;
        }
    }
}
