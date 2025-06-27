// package stirling.software.SPDF.config.fingerprint;
//
// import java.security.MessageDigest;
// import java.security.NoSuchAlgorithmException;
//
// import org.springframework.stereotype.Component;
//
// import jakarta.servlet.http.HttpServletRequest;
//
// @Component
// public class FingerprintGenerator {
//
//    public String generateFingerprint(HttpServletRequest request) {
//        if (request == null) {
//            return "";
//        }
//        StringBuilder fingerprintBuilder = new StringBuilder();
//
//        // Add IP address
//        fingerprintBuilder.append(request.getRemoteAddr());
//
//        // Add X-Forwarded-For header if present (for clients behind proxies)
//        String forwardedFor = request.getHeader("X-Forwarded-For");
//        if (forwardedFor != null) {
//            fingerprintBuilder.append(forwardedFor);
//        }
//
//        // Add User-Agent
//        String userAgent = request.getHeader("User-Agent");
//        if (userAgent != null) {
//            fingerprintBuilder.append(userAgent);
//        }
//
//        // Add Accept-Language header
//        String acceptLanguage = request.getHeader("Accept-Language");
//        if (acceptLanguage != null) {
//            fingerprintBuilder.append(acceptLanguage);
//        }
//
//        // Add Accept header
//        String accept = request.getHeader("Accept");
//        if (accept != null) {
//            fingerprintBuilder.append(accept);
//        }
//
//        // Add Connection header
//        String connection = request.getHeader("Connection");
//        if (connection != null) {
//            fingerprintBuilder.append(connection);
//        }
//
//        // Add server port
//        fingerprintBuilder.append(request.getServerPort());
//
//        // Add secure flag
//        fingerprintBuilder.append(request.isSecure());
//
//        // Generate a hash of the fingerprint
//        return generateHash(fingerprintBuilder.toString());
//    }
//
//    private String generateHash(String input) {
//        try {
//            MessageDigest digest = MessageDigest.getInstance("SHA-256");
//            byte[] hash = digest.digest(input.getBytes());
//            StringBuilder hexString = new StringBuilder();
//            for (byte b : hash) {
//                String hex = Integer.toHexString(0xff & b);
//                if (hex.length() == 1) hexString.append('0');
//                hexString.append(hex);
//            }
//            return hexString.toString();
//        } catch (NoSuchAlgorithmException e) {
//            throw new RuntimeException("Failed to generate fingerprint hash", e);
//        }
//    }
// }
