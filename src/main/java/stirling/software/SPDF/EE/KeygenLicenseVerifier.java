package stirling.software.SPDF.EE;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class KeygenLicenseVerifier {
    private static final String ACCOUNT_ID = "e5430f69-e834-4ae4-befd-b602aae5f372";
    private static final String PRODUCT_ID = "f9bb2423-62c9-4d39-8def-4fdc5aca751e";
    private static final String BASE_URL = "https://api.keygen.sh/v1/accounts";
    private static final String PUBLIC_KEY =
            "-----BEGIN PUBLIC KEY-----\n"
                    + "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzJaf7jPx/bamT/ctmvrf\n"
                    + "5HfzV9CrTx39Hv48NvRIjw9jBAlmcSndLbgcrTUWFrd7pJPPEhzmfJ9tLRg0a3Si\n"
                    + "34Ed9gQ24mODj0Wpos5uwwxu1M5wzsKPjkLZDigB3d9L/79nyKvSUo+mx+dZmZnD\n"
                    + "D19TMM93ZDxG+Bru5/rvvxaZzMHZAnqrTdoO55vFjpss5XJNt6kz4jxr+D6a3lFU\n"
                    + "GGCx7bjeanHCNGRw84dLYbU8s5DGsx5JNX1xPGR1kODocvsHfHJvsxfdNtpH4vke\n"
                    + "yOrtEUCp01Mh2kr3zM8R4Yjh4ae2qHiZne0FiVhiUaHmbf2dmcA9O1Kynz33634s\n"
                    + "fwIDAQAB\n"
                    + "-----END PUBLIC KEY-----";
    private static final ObjectMapper objectMapper = new ObjectMapper();

    public static boolean verifyLicense(String licenseKey) {
        try {
            String machineFingerprint = generateMachineFingerprint();

            // First, try to validate the license
            boolean isValid = validateLicense(licenseKey, machineFingerprint);

            // If validation fails, try to activate the machine
            if (!isValid) {
                System.out.println(
                        "License validation failed. Attempting to activate the machine...");
                isValid = activateMachine(licenseKey, machineFingerprint);

                if (isValid) {
                    // If activation is successful, try to validate again
                    isValid = validateLicense(licenseKey, machineFingerprint);
                }
            }

            return isValid;
        } catch (Exception e) {
            System.out.println("Error verifying license: " + e.getMessage());
            return false;
        }
    }

    private static boolean validateLicense(String licenseKey, String machineFingerprint)
            throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        String requestBody =
                String.format(
                        "{\"meta\":{\"key\":\"%s\",\"scope\":{\"fingerprint\":\"%s\",\"product\":\"%s\"}}}",
                        licenseKey, machineFingerprint, PRODUCT_ID);

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
                        .header("Authorization", "license " + licenseKey)
                        .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                        .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 200) {
            JsonNode jsonResponse = objectMapper.readTree(response.body());
            JsonNode metaNode = jsonResponse.path("meta");
            boolean isValid = metaNode.path("valid").asBoolean();
            String detail = metaNode.path("detail").asText();
            String code = metaNode.path("code").asText();

            System.out.println("License validity: " + isValid);
            System.out.println("Validation detail: " + detail);
            System.out.println("Validation code: " + code);

            if (isValid) {
                return verifySignature(metaNode);
            }
        } else {
            System.out.println("Error validating license. Status code: " + response.statusCode());
            System.out.println("Response body: " + response.body());
        }
        return false;
    }

    private static boolean activateMachine(String licenseKey, String machineFingerprint)
            throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        String requestBody =
                String.format(
                        "{\"data\":{\"type\":\"machines\",\"attributes\":{\"fingerprint\":\"%s\"},\"relationships\":{\"license\":{\"data\":{\"type\":\"licenses\",\"id\":\"%s\"}}}}}",
                        machineFingerprint, licenseKey);

        String licenseId = "8e072b67-3cea-454b-98bb-bb73bbc04bd4";
        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create(BASE_URL + "/" + ACCOUNT_ID + "/machines"))
                        .header("Content-Type", "application/vnd.api+json")
                        .header("Accept", "application/vnd.api+json")
                        .header("Authorization", "license " + licenseId)
                        .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                        .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 201) {
            System.out.println("Machine activated successfully");
            return true;
        } else {
            System.out.println("Error activating machine. Status code: " + response.statusCode());
            System.out.println("Response body: " + response.body());
            return false;
        }
    }

    private static boolean verifySignature(JsonNode metaNode) throws Exception {
        String signature = metaNode.path("signature").asText();
        String data = metaNode.path("data").asText();

        PublicKey publicKey =
                KeyFactory.getInstance("RSA")
                        .generatePublic(
                                new X509EncodedKeySpec(
                                        Base64.getDecoder()
                                                .decode(
                                                        PUBLIC_KEY
                                                                .replace(
                                                                        "-----BEGIN PUBLIC KEY-----",
                                                                        "")
                                                                .replace(
                                                                        "-----END PUBLIC KEY-----",
                                                                        "")
                                                                .replaceAll("\\s", ""))));

        Signature sig = Signature.getInstance("SHA256withRSA");
        sig.initVerify(publicKey);
        sig.update(data.getBytes());

        boolean isSignatureValid = sig.verify(Base64.getDecoder().decode(signature));
        System.out.println("Signature validity: " + isSignatureValid);
        return isSignatureValid;
    }

    private static String generateMachineFingerprint() {
        // This is a simplified example. In a real-world scenario, you'd want to generate
        // a more robust and unique fingerprint based on hardware characteristics.
        return "example-fingerprint-" + System.currentTimeMillis();
    }

    public static void test() {
        String[] testKeys = {
            "FYKJ-YK7F-MEVX-RYKK-JYWE-77WW-3TKN-PJRU", "EFDB57-92B4C2-EDFA20-51146E-E1AF4A-V3"
        };

        for (String licenseKey : testKeys) {
            System.out.println("Testing license key: " + licenseKey);
            boolean isValid = verifyLicense(licenseKey);
            System.out.println("License is valid: " + isValid);
            System.out.println("--------------------");
        }
    }
}
