package stirling.software.SPDF.utils;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.List;
import java.util.UUID;

import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.core.io.support.ResourcePatternUtils;
import org.springframework.web.multipart.MultipartFile;

import com.fathzer.soft.javaluator.DoubleEvaluator;

import io.github.pixee.security.HostValidator;
import io.github.pixee.security.Urls;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.InstallationPathConfig;
import stirling.software.SPDF.config.YamlHelper;

@Slf4j
public class GeneralUtils {

    public static File convertMultipartFileToFile(MultipartFile multipartFile) throws IOException {
        File tempFile = Files.createTempFile("temp", null).toFile();
        try (InputStream inputStream = multipartFile.getInputStream();
                FileOutputStream outputStream = new FileOutputStream(tempFile)) {

            byte[] buffer = new byte[8192];
            int bytesRead;

            while ((bytesRead = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, bytesRead);
            }
        }
        return tempFile;
    }

    public static void deleteDirectory(Path path) throws IOException {
        Files.walkFileTree(
                path,
                new SimpleFileVisitor<Path>() {
                    @Override
                    public FileVisitResult visitFile(Path file, BasicFileAttributes attrs)
                            throws IOException {
                        Files.deleteIfExists(file);
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult postVisitDirectory(Path dir, IOException exc)
                            throws IOException {
                        Files.deleteIfExists(dir);
                        return FileVisitResult.CONTINUE;
                    }
                });
    }

    public static String convertToFileName(String name) {
        String safeName = name.replaceAll("[^a-zA-Z0-9]", "_");
        if (safeName.length() > 50) {
            safeName = safeName.substring(0, 50);
        }
        return safeName;
    }

    // Get resources from a location pattern
    public static Resource[] getResourcesFromLocationPattern(
            String locationPattern, ResourceLoader resourceLoader) throws Exception {
        // Normalize the path for file resources
        if (locationPattern.startsWith("file:")) {
            String rawPath = locationPattern.substring(5).replace("\\*", "").replace("/*", "");
            Path normalizePath = Paths.get(rawPath).normalize();
            locationPattern = "file:" + normalizePath.toString().replace("\\", "/") + "/*";
        }
        return ResourcePatternUtils.getResourcePatternResolver(resourceLoader)
                .getResources(locationPattern);
    }

    public static boolean isValidURL(String urlStr) {
        try {
            Urls.create(
                    urlStr, Urls.HTTP_PROTOCOLS, HostValidator.DENY_COMMON_INFRASTRUCTURE_TARGETS);
            return true;
        } catch (MalformedURLException e) {
            return false;
        }
    }

    public static boolean isURLReachable(String urlStr) {
        try {
            // Parse the URL
            URL url = URI.create(urlStr).toURL();

            // Allow only http and https protocols
            String protocol = url.getProtocol();
            if (!"http".equals(protocol) && !"https".equals(protocol)) {
                return false; // Disallow other protocols
            }

            // Check if the host is a local address
            String host = url.getHost();
            if (isLocalAddress(host)) {
                return false; // Exclude local addresses
            }

            // Check if the URL is reachable
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("HEAD");
            // connection.setConnectTimeout(5000); // Set connection timeout
            // connection.setReadTimeout(5000);    // Set read timeout
            int responseCode = connection.getResponseCode();
            return (200 <= responseCode && responseCode <= 399);
        } catch (Exception e) {
            return false; // Return false in case of any exception
        }
    }

    private static boolean isLocalAddress(String host) {
        try {
            // Resolve DNS to IP address
            InetAddress address = InetAddress.getByName(host);

            // Check for local addresses
            return address.isAnyLocalAddress()
                    || // Matches 0.0.0.0 or similar
                    address.isLoopbackAddress()
                    || // Matches 127.0.0.1 or ::1
                    address.isSiteLocalAddress()
                    || // Matches private IPv4 ranges: 192.168.x.x, 10.x.x.x, 172.16.x.x to
                    // 172.31.x.x
                    address.getHostAddress()
                            .startsWith("fe80:"); // Matches link-local IPv6 addresses
        } catch (Exception e) {
            return false; // Return false for invalid or unresolved addresses
        }
    }

    public static File multipartToFile(MultipartFile multipart) throws IOException {
        Path tempFile = Files.createTempFile("overlay-", ".pdf");
        try (InputStream in = multipart.getInputStream();
                FileOutputStream out = new FileOutputStream(tempFile.toFile())) {
            byte[] buffer = new byte[1024];
            int bytesRead;
            while ((bytesRead = in.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
            }
        }
        return tempFile.toFile();
    }

    public static Long convertSizeToBytes(String sizeStr) {
        if (sizeStr == null) {
            return null;
        }

        sizeStr = sizeStr.trim().toUpperCase();
        sizeStr = sizeStr.replace(",", ".").replace(" ", "");
        try {
            if (sizeStr.endsWith("KB")) {
                return (long)
                        (Double.parseDouble(sizeStr.substring(0, sizeStr.length() - 2)) * 1024);
            } else if (sizeStr.endsWith("MB")) {
                return (long)
                        (Double.parseDouble(sizeStr.substring(0, sizeStr.length() - 2))
                                * 1024
                                * 1024);
            } else if (sizeStr.endsWith("GB")) {
                return (long)
                        (Double.parseDouble(sizeStr.substring(0, sizeStr.length() - 2))
                                * 1024
                                * 1024
                                * 1024);
            } else if (sizeStr.endsWith("B")) {
                return Long.parseLong(sizeStr.substring(0, sizeStr.length() - 1));
            } else {
                // Assume MB if no unit is specified
                return (long) (Double.parseDouble(sizeStr) * 1024 * 1024);
            }
        } catch (NumberFormatException e) {
            // The numeric part of the input string cannot be parsed, handle this case
        }

        return null;
    }

    public static String formatBytes(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        } else if (bytes < 1024 * 1024) {
            return String.format("%.2f KB", bytes / 1024.0);
        } else if (bytes < 1024 * 1024 * 1024) {
            return String.format("%.2f MB", bytes / (1024.0 * 1024.0));
        } else {
            return String.format("%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0));
        }
    }

    public static List<Integer> parsePageList(String pages, int totalPages, boolean oneBased) {
        if (pages == null) {
            return List.of(1); // Default to first page if input is null
        }
        try {
            return parsePageList(pages.split(","), totalPages, oneBased);
        } catch (NumberFormatException e) {
            return List.of(1); // Default to first page if input is invalid
        }
    }

    public static List<Integer> parsePageList(String[] pages, int totalPages) {
        return parsePageList(pages, totalPages, false);
    }

    public static List<Integer> parsePageList(String[] pages, int totalPages, boolean oneBased) {
        List<Integer> result = new ArrayList<>();
        int offset = oneBased ? 1 : 0;
        for (String page : pages) {
            if ("all".equalsIgnoreCase(page)) {

                for (int i = 0; i < totalPages; i++) {
                    result.add(i + offset);
                }
            } else if (page.contains(",")) {
                // Split the string into parts, could be single pages or ranges
                String[] parts = page.split(",");
                for (String part : parts) {
                    result.addAll(handlePart(part, totalPages, offset));
                }
            } else {
                result.addAll(handlePart(page, totalPages, offset));
            }
        }
        return result;
    }

    public static List<Integer> evaluateNFunc(String expression, int maxValue) {
        List<Integer> results = new ArrayList<>();
        DoubleEvaluator evaluator = new DoubleEvaluator();

        // Validate the expression
        if (!expression.matches("[0-9n+\\-*/() ]+")) {
            throw new IllegalArgumentException("Invalid expression");
        }

        for (int n = 1; n <= maxValue; n++) {
            // Replace 'n' with the current value of n, correctly handling numbers before
            // 'n'
            String sanitizedExpression = sanitizeNFunction(expression, n);
            Double result = evaluator.evaluate(sanitizedExpression);

            // Check if the result is null or not within bounds
            if (result == null) break;

            if (result.intValue() > 0 && result.intValue() <= maxValue)
                results.add(result.intValue());
        }

        return results;
    }

    private static String sanitizeNFunction(String expression, int nValue) {
        String sanitizedExpression = expression.replace(" ", "");
        String multiplyByOpeningRoundBracketPattern =
                "([0-9n)])\\("; // example: n(n-1), 9(n-1), (n-1)(n-2)
        sanitizedExpression =
                sanitizedExpression.replaceAll(multiplyByOpeningRoundBracketPattern, "$1*(");

        String multiplyByClosingRoundBracketPattern =
                "\\)([0-9n)])"; // example: (n-1)n, (n-1)9, (n-1)(n-2)
        sanitizedExpression =
                sanitizedExpression.replaceAll(multiplyByClosingRoundBracketPattern, ")*$1");

        sanitizedExpression = insertMultiplicationBeforeN(sanitizedExpression, nValue);
        return sanitizedExpression;
    }

    private static String insertMultiplicationBeforeN(String expression, int nValue) {
        // Insert multiplication between a number and 'n' (e.g., "4n" becomes "4*n")
        String withMultiplication = expression.replaceAll("(\\d)n", "$1*n");
        withMultiplication = formatConsecutiveNsForNFunction(withMultiplication);
        // Now replace 'n' with its current value
        return withMultiplication.replace("n", String.valueOf(nValue));
    }

    private static String formatConsecutiveNsForNFunction(String expression) {
        String text = expression;
        while (text.matches(".*n{2,}.*")) {
            text = text.replaceAll("(?<!n)n{2}", "n*n");
        }
        return text;
    }

    private static List<Integer> handlePart(String part, int totalPages, int offset) {
        List<Integer> partResult = new ArrayList<>();

        // First check for n-syntax because it should not be processed as a range
        if (part.contains("n")) {
            partResult = evaluateNFunc(part, totalPages);
            // Adjust the results according to the offset
            for (int i = 0; i < partResult.size(); i++) {
                int adjustedValue = partResult.get(i) - 1 + offset;
                partResult.set(i, adjustedValue);
            }
        } else if (part.contains("-")) {
            // Process ranges only if it's not n-syntax
            String[] rangeParts = part.split("-");
            try {
                int start = Integer.parseInt(rangeParts[0]);
                int end =
                        (rangeParts.length > 1 && !rangeParts[1].isEmpty())
                                ? Integer.parseInt(rangeParts[1])
                                : totalPages;
                for (int i = start; i <= end; i++) {
                    if (i >= 1 && i <= totalPages) {
                        partResult.add(i - 1 + offset);
                    }
                }
            } catch (NumberFormatException e) {
                // Range is invalid, ignore this part
            }
        } else {
            // This is a single page number
            try {
                int pageNum = Integer.parseInt(part.trim());
                if (pageNum >= 1 && pageNum <= totalPages) {
                    partResult.add(pageNum - 1 + offset);
                }
            } catch (NumberFormatException ignored) {
                // Ignore invalid numbers
            }
        }
        return partResult;
    }

    public static boolean createDir(String path) {
        Path folder = Paths.get(path);
        if (!Files.exists(folder)) {
            try {
                Files.createDirectories(folder);
            } catch (IOException e) {
                log.error("exception", e);
                return false;
            }
        }
        return true;
    }

    public static boolean isValidUUID(String uuid) {
        if (uuid == null) {
            return false;
        }
        try {
            UUID.fromString(uuid);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /*------------------------------------------------------------------------*
     *                  Internal Implementation Details                       *
     *------------------------------------------------------------------------*/

    public static void saveKeyToSettings(String key, Object newValue) throws IOException {
        String[] keyArray = key.split("\\.");
        Path settingsPath = Paths.get(InstallationPathConfig.getSettingsPath());
        YamlHelper settingsYaml = new YamlHelper(settingsPath);
        settingsYaml.updateValue(Arrays.asList(keyArray), newValue);
        settingsYaml.saveOverride(settingsPath);
    }

    public static String generateMachineFingerprint() {
        try {
            // Get the MAC address
            StringBuilder sb = new StringBuilder();
            InetAddress ip = InetAddress.getLocalHost();
            NetworkInterface network = NetworkInterface.getByInetAddress(ip);

            if (network == null) {
                Enumeration<NetworkInterface> networks = NetworkInterface.getNetworkInterfaces();
                while (networks.hasMoreElements()) {
                    NetworkInterface net = networks.nextElement();
                    byte[] mac = net.getHardwareAddress();
                    if (mac != null) {
                        for (int i = 0; i < mac.length; i++) {
                            sb.append(String.format("%02X", mac[i]));
                        }
                        break; // Use the first network interface with a MAC address
                    }
                }
            } else {
                byte[] mac = network.getHardwareAddress();
                if (mac != null) {
                    for (int i = 0; i < mac.length; i++) {
                        sb.append(String.format("%02X", mac[i]));
                    }
                }
            }

            // Hash the MAC address for privacy and consistency
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(sb.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder fingerprint = new StringBuilder();
            for (byte b : hash) {
                fingerprint.append(String.format("%02x", b));
            }
            return fingerprint.toString();
        } catch (Exception e) {
            return "GenericID";
        }
    }

    public static boolean isVersionHigher(String currentVersion, String compareVersion) {
        if (currentVersion == null || compareVersion == null) {
            return false;
        }

        // Split versions into components
        String[] current = currentVersion.split("\\.");
        String[] compare = compareVersion.split("\\.");

        // Get the length of the shorter version array
        int length = Math.min(current.length, compare.length);

        // Compare each component
        for (int i = 0; i < length; i++) {
            int currentPart = Integer.parseInt(current[i]);
            int comparePart = Integer.parseInt(compare[i]);

            if (currentPart > comparePart) {
                return true;
            }
            if (currentPart < comparePart) {
                return false;
            }
        }

        // If all components so far are equal, the longer version is considered higher
        return current.length > compare.length;
    }
}
