package stirling.software.SPDF.EE;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.posthog.java.shaded.org.json.JSONObject;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class KeygenLicenseVerifier {
    private static final String ACCOUNT_ID = "e5430f69-e834-4ae4-befd-b602aae5f372";
    private static final String PRODUCT_ID = "f9bb2423-62c9-4d39-8def-4fdc5aca751e";
    private static final String BASE_URL = "https://api.keygen.sh/v1/accounts";
    private static final ObjectMapper objectMapper = new ObjectMapper();

    //    23:26:20.344 [scheduling-1] INFO  s.s.SPDF.EE.KeygenLicenseVerifier -
    // validateLicenseResponse body:
    // {"data":{"id":"808ed3c9-584b-46dd-8a80-c9217ef70915","type":"licenses","attributes":{"name":"userCounTest","key":"A7EW-KUPF-PRML-RRVL-HLMP-7THR-F7KE-XF4C","expiry":"2024-10-31T21:39:49.271Z","status":"ACTIVE","uses":0,"suspended":false,"scheme":null,"encrypted":false,"strict":true,"floating":true,"protected":true,"version":null,"maxMachines":1,"maxProcesses":null,"maxUsers":null,"maxCores":null,"maxUses":null,"requireHeartbeat":false,"requireCheckIn":false,"lastValidated":"2024-10-01T22:26:18.121Z","lastCheckIn":null,"nextCheckIn":null,"lastCheckOut":null,"metadata":{"users":10},"created":"2024-10-01T21:39:49.268Z","updated":"2024-10-01T21:39:49.268Z"},"relationships":{"account":{"links":{"related":"/v1/accounts/e5430f69-e834-4ae4-befd-b602aae5f372"},"data":{"type":"accounts","id":"e5430f69-e834-4ae4-befd-b602aae5f372"}},"environment":{"links":{"related":null},"data":null},"product":{"links":{"related":"/v1/accounts/e5430f69-e834-4ae4-befd-b602aae5f372/licenses/808ed3c9-584b-46dd-8a80-c9217ef70915/product"},"data":{"type":"products","id":"f9bb2423-62c9-4d39-8def-4fdc5aca751e"}},"policy":{"links":{"related":"/v1/accounts/e5430f69-e834-4ae4-befd-b602aae5f372/licenses/808ed3c9-584b-46dd-8a80-c9217ef70915/policy"},"data":{"type":"policies","id":"04caef06-9ac2-4084-bf3c-bca4a0d29143"}},"group":{"links":{"related":"/v1/accounts/e5430f69-e834-4ae4-befd-b602aae5f372/licenses/808ed3c9-584b-46dd-8a80-c9217ef70915/group"},"data":null},"owner":{"links":{"related":"/v1/accounts/e5430f69-e834-4ae4-befd-b602aae5f372/licenses/808ed3c9-584b-46dd-8a80-c9217ef70915/owner"},"data":null},"users":{"links":{"related":"/v1/accounts/e5430f69-e834-4ae4-befd-b602aae5f372/licenses/808ed3c9-584b-46dd-8a80-c9217ef70915/users"},"meta":{"count":0}},"machines":{"links":{"related":"/v1/accounts/e5430f69-e834-4ae4-befd-b602aae5f372/licenses/808ed3c9-584b-46dd-8a80-c9217ef70915/machines"},"meta":{"cores":0,"count":0}},"tokens":{"links":{"related":"/v1/accounts/e5430f69-e834-4ae4-befd-b602aae5f372/licenses/808ed3c9-584b-46dd-8a80-c9217ef70915/tokens"}},"entitlements":{"links":{"related":"/v1/accounts/e5430f69-e834-4ae4-befd-b602aae5f372/licenses/808ed3c9-584b-46dd-8a80-c9217ef70915/entitlements"}}},"links":{"self":"/v1/accounts/e5430f69-e834-4ae4-befd-b602aae5f372/licenses/808ed3c9-584b-46dd-8a80-c9217ef70915"}},"meta":{"ts":"2024-10-01T22:26:18.124Z","valid":false,"detail":"fingerprint is not activated (has no associated machines)","code":"NO_MACHINES","scope":{"fingerprint":"example-fingerprint"}}}

    public boolean verifyLicense(String licenseKey) {
        try {
            log.info("Checking license key");
            String machineFingerprint = generateMachineFingerprint();

            // First, try to validate the license
            JsonNode validationResponse = validateLicense(licenseKey, machineFingerprint);
            log.info(validationResponse.asText());
            if (validationResponse != null) {
                boolean isValid = validationResponse.path("meta").path("valid").asBoolean();
                String licenseId = validationResponse.path("data").path("id").asText();
                if (!isValid) {
                    String code = validationResponse.path("meta").path("code").asText();
                    log.debug(code);
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
            log.error("Error verifying license: " + e.getMessage());
            return false;
        }
    }

    private static JsonNode validateLicense(String licenseKey, String machineFingerprint)
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
        log.info(" validateLicenseResponse body: " + response.body());
        JsonNode jsonResponse = objectMapper.readTree(response.body());
        if (response.statusCode() == 200) {

            JsonNode metaNode = jsonResponse.path("meta");
            boolean isValid = metaNode.path("valid").asBoolean();

            String detail = metaNode.path("detail").asText();
            String code = metaNode.path("code").asText();

            log.debug("License validity: " + isValid);
            log.debug("Validation detail: " + detail);
            log.debug("Validation code: " + code);

        } else {
            log.error("Error validating license. Status code: " + response.statusCode());
        }
        return jsonResponse;
    }

    private static boolean activateMachine(
            String licenseKey, String licenseId, String machineFingerprint) throws Exception {
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
                                                                System.getProperty(
                                                                        "os.name")) // Added
                                                        // platform
                                                        // parameter
                                                        .put(
                                                                "name",
                                                                hostname)) // Added name parameter
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
                        .header(
                                "Authorization",
                                "License " + licenseKey) // Keep the license key authentication
                        .POST(
                                HttpRequest.BodyPublishers.ofString(
                                        body.toString())) // Send the JSON body
                        .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        log.debug("activateMachine Response body: " + response.body());
        if (response.statusCode() == 201) {
            log.info("Machine activated successfully");
            return true;
        } else {
            log.error("Error activating machine. Status code: " + response.statusCode());

            return false;
        }
    }

    private static String generateMachineFingerprint() {
        // This is a simplified example. In a real-world scenario, you'd want to generate
        // a more robust and unique fingerprint based on hardware characteristics.
        return "example-fingerprint";
    }
}
