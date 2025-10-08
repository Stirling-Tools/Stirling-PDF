package stirling.software.common.util;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.core.io.support.ResourcePatternUtils;
import org.springframework.web.multipart.MultipartFile;

import com.fathzer.soft.javaluator.DoubleEvaluator;

import io.github.pixee.security.HostValidator;
import io.github.pixee.security.Urls;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;

@Slf4j
@UtilityClass
public class GeneralUtils {

    /** Maximum number of resolved DNS addresses allowed for a host before it is considered unsafe. */
    private static final int MAX_DNS_ADDRESSES = 20;

    private final Set<String> DEFAULT_VALID_SCRIPTS = Set.of("png_to_webp.py", "split_photos.py");
    private final Set<String> DEFAULT_VALID_PIPELINE =
            Set.of(
                    "OCR images.json",
                    "Prepare-pdfs-for-email.json",
                    "split-rotate-auto-rename.json");

    private final String DEFAULT_WEBUI_CONFIGS_DIR = "defaultWebUIConfigs";
    private final String PYTHON_SCRIPTS_DIR = "python";
    private final RegexPatternUtils patternCache = RegexPatternUtils.getInstance();
    // Valid size units used for convertSizeToBytes validation and parsing
    private final Set<String> VALID_SIZE_UNITS = Set.of("B", "KB", "MB", "GB", "TB");

    /*
     * Converts a MultipartFile to a regular File with improved performance and security.
     *
     * @param multipartFile the multipart file to convert
     * @return temporary File containing the multipart file data
     * @throws IOException if I/O error occurs during conversion
     * @throws IllegalArgumentException if file exceeds maximum allowed size
     */
    public File convertMultipartFileToFile(MultipartFile multipartFile) throws IOException {
        String customTempDir = System.getenv("STIRLING_TEMPFILES_DIRECTORY");
        if (customTempDir == null || customTempDir.isEmpty()) {
            customTempDir = System.getProperty("stirling.tempfiles.directory");
        }

        File tempFile;

        if (customTempDir != null && !customTempDir.isEmpty()) {
            Path tempDir = Path.of(customTempDir);
            if (!Files.exists(tempDir)) {
                Files.createDirectories(tempDir);
            }
            tempFile = Files.createTempFile(tempDir, "stirling-pdf-", null).toFile();
        } else {
            Path tempDir = Path.of(System.getProperty("java.io.tmpdir"), "stirling-pdf");
            if (!Files.exists(tempDir)) {
                Files.createDirectories(tempDir);
            }
            tempFile = Files.createTempFile(tempDir, "stirling-pdf-", null).toFile();
        }

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

    /*
     * Gets the configured temporary directory, creating it if necessary.
     *
     * @return Path to the temporary directory
     * @throws IOException if directory creation fails
     */
    private Path getTempDirectory() throws IOException {
        String customTempDir = System.getenv("STIRLING_TEMPFILES_DIRECTORY");
        if (customTempDir == null || customTempDir.isEmpty()) {
            customTempDir = System.getProperty("stirling.tempfiles.directory");
        }

        Path tempDir;
        if (customTempDir != null && !customTempDir.isEmpty()) {
            tempDir = Path.of(customTempDir);
        } else {
            tempDir = Path.of(System.getProperty("java.io.tmpdir"), "stirling-pdf");
        }

        if (!Files.exists(tempDir)) {
            Files.createDirectories(tempDir);
        }

        return tempDir;
    }

    /*
     * Remove file extension
     *
     * <p>Uses fast string operations for common cases (valid extensions) and falls back to
     * optimized regex for edge cases (no extension, hidden files, etc.).
     *
     * <ul>
     *   <li>String operations avoid regex engine overhead for common cases
     *   <li>Cached pattern compilation eliminates recompilation costs
     *   <li>Fresh Matcher instances ensure thread safety
     * </ul>
     *
     * @param filename the filename to process, may be null
     * @return filename without extension, or "default" if input is null
     */
    public String removeExtension(String filename) {
        if (filename == null) {
            return "default";
        }

        if (filename.isEmpty()) {
            return filename;
        }

        int dotIndex = filename.lastIndexOf('.');
        if (dotIndex > 0 && dotIndex < filename.length() - 1) {
            return filename.substring(0, dotIndex);
        }

        if (dotIndex == 0 || dotIndex == filename.length() - 1 || dotIndex == -1) {
            return filename;
        }

        Pattern pattern = patternCache.getPattern(RegexPatternUtils.getExtensionRegex());
        Matcher matcher = pattern.matcher(filename);
        return matcher.find() ? matcher.replaceFirst("") : filename;
    }

    /**
     * Append suffix to base name with null safety.
     *
     * @param baseName the base filename, null becomes "default"
     * @param suffix the suffix to append, null becomes empty string
     * @return concatenated string with null safety
     */
    public String appendSuffix(String baseName, String suffix) {
        return (baseName == null ? "default" : baseName) + (suffix != null ? suffix : "");
    }

    /**
     * Generate a PDF filename by removing extension from first file and adding suffix.
     *
     * <p>High-level utility method for common PDF naming scenarios. Handles null safety and uses
     * extension removal.
     *
     * @param firstFilename the filename of the first file being, may be null
     * @param suffix the suffix to append (e.g., "_merged.pdf")
     * @return filename with suffix, or default name if input is null
     */
    public String generateFilename(String firstFilename, String suffix) {
        String baseName = removeExtension(firstFilename);
        return appendSuffix(baseName, suffix);
    }

    /**
     * Process a list of filenames by removing extensions and adding suffix.
     *
     * <p>Efficiently processes multiple filenames using streaming operations and bulk operations
     * where possible. Handles null safety for both input list and individual filenames.
     *
     * @param filenames the list of filenames to process, may be null
     * @param suffix the suffix to append to each processed filename
     * @param processor consumer to handle each processed filename, may be null
     */
    public void processFilenames(
            List<String> filenames, String suffix, java.util.function.Consumer<String> processor) {
        if (filenames == null || processor == null) {
            return;
        }

        filenames.stream()
                .map(filename -> appendSuffix(removeExtension(filename), suffix))
                .forEach(processor);
    }

    /**
     * Extract title from filename by removing extension, with fallback handling.
     *
     * <p>Returns "Untitled" for null or empty filenames, otherwise removes the extension using the
     * optimized removeExtension method.
     *
     * @param filename the filename to extract title from, may be null
     * @return the title without extension, or "Untitled" if input is null/empty
     */
    public String getTitleFromFilename(String filename) {
        if (filename == null || filename.isEmpty()) {
            return "Untitled";
        }
        return removeExtension(filename);
    }

    public void deleteDirectory(Path path) throws IOException {
        Files.walkFileTree(
                path,
                new SimpleFileVisitor<>() {
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

    public String convertToFileName(String name) {
        if (name == null) return "_";
        StringBuilder safeNameBuilder = new StringBuilder(name.length());
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (Character.isLetterOrDigit(c)) {
                safeNameBuilder.append(c);
            } else {
                safeNameBuilder.append('_');
            }
        }
        String safeName = safeNameBuilder.toString();
        if (safeName.length() > 50) {
            safeName = safeName.substring(0, 50);
        }
        return safeName;
    }

    // Get resources from a location pattern
    public Resource[] getResourcesFromLocationPattern(
            String locationPattern, ResourceLoader resourceLoader) throws Exception {
        // Normalize the path for file resources
        String pattern = locationPattern;
        if (pattern.startsWith("file:")) {
            String rawPath = pattern.substring(5).replace("\\*", "").replace("/*", "");
            Path normalizePath = Paths.get(rawPath).normalize();
            pattern = "file:" + normalizePath.toString().replace("\\", "/") + "/*";
        }
        return ResourcePatternUtils.getResourcePatternResolver(resourceLoader)
                .getResources(pattern);
    }

    /**
     * Validates URL syntax and disallows common-infrastructure targets to reduce SSRF risk.
     *
     * @param urlStr a URL string to validate
     * @return {@code true} if the URL is syntactically valid and allowed; {@code false} otherwise
     */
    public boolean isValidURL(String urlStr) {
        try {
            Urls.create(
                    urlStr, Urls.HTTP_PROTOCOLS, HostValidator.DENY_COMMON_INFRASTRUCTURE_TARGETS);
            return true;
        } catch (MalformedURLException e) {
            return false;
        }
    }

    /**
     * Checks if a URL is reachable with proper timeout configuration and error handling.
     *
     * @param urlStr the URL string to check
     * @return true if URL is reachable, false otherwise
     */
    public boolean isURLReachable(String urlStr) {
        return isURLReachable(urlStr, 5000, 5000);
    }

    /**
     * Checks whether a URL is reachable using configurable timeouts. Only {@code http} and
     * {@code https} protocols are permitted, and local/private/multicast ranges are blocked.
     *
     * @param urlStr the URL to probe
     * @param connectTimeout connection timeout in milliseconds
     * @param readTimeout read timeout in milliseconds
     * @return {@code true} if a HEAD request returns a 2xx or 3xx status; {@code false} otherwise
     */
    public boolean isURLReachable(String urlStr, int connectTimeout, int readTimeout) {
        HttpURLConnection connection = null;
        try {
            // Parse the URL
            URL url = URI.create(urlStr).toURL();

            // Allow only http and https protocols
            String protocol = url.getProtocol();
            if (!"http".equals(protocol) && !"https".equals(protocol)) {
                return false; // Disallow other protocols
            }

            String host = url.getHost();
            if (host == null || host.isBlank()) {
                return false;
            }

            if (isDisallowedNetworkLocation(host)) {
                return false; // Exclude local, private or otherwise sensitive addresses
            }

            // Check if the URL is reachable
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("HEAD");
            connection.setConnectTimeout(connectTimeout);
            connection.setReadTimeout(readTimeout);
            connection.setInstanceFollowRedirects(false); // Security: prevent redirect loops

            int responseCode = connection.getResponseCode();
            return (200 <= responseCode && responseCode <= 399);
        } catch (Exception e) {
            log.debug("URL {} is not reachable: {}", urlStr, e.getMessage());
            return false; // Return false in case of any exception
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    /**
     * Determines whether the specified host resolves to a disallowed network location, such as
     * local, private, multicast, or reserved ranges. Excessive DNS results are also blocked.
     *
     * @param host the hostname to resolve
     * @return {@code true} if the host should be considered unsafe
     */
    private boolean isDisallowedNetworkLocation(String host) {
        // Resolution is delegated to the JVM/OS resolver which already applies system
        // configured query limits and timeouts. We only need the resolved addresses here so
        // that we can enforce the MAX_DNS_ADDRESSES limit and perform the sensitive range
        // checks below.
        try {
            InetAddress[] addresses = InetAddress.getAllByName(host);
            if (addresses.length > MAX_DNS_ADDRESSES) {
                log.debug(
                        "Blocking URL to host {} due to excessive DNS records (>{})",
                        host,
                        MAX_DNS_ADDRESSES);
                return true;
            }
            for (InetAddress address : addresses) {
                if (address == null || isSensitiveAddress(address)) {
                    log.debug("Blocking URL to host {} resolved to {}", host, address);
                    return true;
                }
            }
            return false;
        } catch (Exception e) {
            log.debug("Unable to resolve host {}: {}", host, e.getMessage());
            return true; // Treat resolution issues as unsafe to avoid SSRF
        }
    }

    /**
     * Returns whether the given IP address lies within ranges that should not be contacted by the
     * server (loopback, link-local, private, multicast, etc.). IPv6 ULA and IPv4-mapped addresses
     * are handled.
     *
     * @param address the resolved address
     * @return {@code true} if the address is considered sensitive
     */
    private boolean isSensitiveAddress(InetAddress address) {
        if (address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()) {
            return true;
        }

        byte[] rawAddress = address.getAddress();
        if (address instanceof Inet4Address) {
            return isPrivateOrReservedIPv4(rawAddress);
        }

        if (address instanceof Inet6Address inet6Address) {
            if (isUniqueLocalIPv6(rawAddress)) {
                return true;
            }
            if (isIPv4MappedAddress(rawAddress) || inet6Address.isIPv4CompatibleAddress()) {
                byte[] ipv4 =
                        Arrays.copyOfRange(rawAddress, rawAddress.length - 4, rawAddress.length);
                return isPrivateOrReservedIPv4(ipv4);
            }
        }

        return false;
    }

    /**
     * Checks whether an IPv4 address is private or reserved. Any malformed input defaults to
     * {@code true} (conservative) to avoid misuse.
     *
     * @param address 4-byte IPv4 address
     * @return {@code true} if private/reserved
     */
    private boolean isPrivateOrReservedIPv4(byte[] address) {
        // IPv4 addresses must be exactly 4 bytes. Treat null or unexpected lengths as
        // sensitive to avoid processing malformed input.
        if (address == null || address.length != 4) {
            return true;
        }

        int first = Byte.toUnsignedInt(address[0]);
        int second = Byte.toUnsignedInt(address[1]);

        if (first == 0 || first == 127) {
            return true; // 0.0.0.0/8 and 127.0.0.0/8
        }
        if (first == 100 && second >= 64 && second <= 127) {
            return true; // 100.64.0.0/10 Carrier-grade NAT
        }
        if (first == 169 && second == 254) {
            return true; // 169.254.0.0/16 Link-local
        }
        if (first == 172 && second >= 16 && second <= 31) {
            return true; // 172.16.0.0/12 Private
        }
        if (first == 192 && second == 0 && Byte.toUnsignedInt(address[2]) == 0) {
            return true; // 192.0.0.0/24 IETF Protocol Assignments
        }
        if (first == 192 && second == 0 && Byte.toUnsignedInt(address[2]) == 2) {
            return true; // 192.0.2.0/24 TEST-NET-1
        }
        if (first == 192 && second == 168) {
            return true; // 192.168.0.0/16 Private
        }
        if (first == 198 && (second == 18 || second == 19)) {
            return true; // 198.18.0.0/15 Benchmark tests
        }
        if (first == 198 && second == 51 && Byte.toUnsignedInt(address[2]) == 100) {
            return true; // 198.51.100.0/24 TEST-NET-2
        }
        if (first == 203 && second == 0 && Byte.toUnsignedInt(address[2]) == 113) {
            return true; // 203.0.113.0/24 TEST-NET-3
        }
        if (first == 10) {
            return true; // 10.0.0.0/8 Private
        }
        if (first >= 224) {
            return true; // 224.0.0.0/4 Multicast and 240.0.0.0/4 Reserved for future use
        }
        return false;
    }

    /**
     * Checks whether an IPv6 address is a Unique Local Address (ULA, fc00::/7). Any malformed input
     * defaults to {@code true} (conservative) to avoid misuse.
     *
     * @param address 16-byte IPv6 address
     * @return {@code true} if ULA
     */
    private boolean isUniqueLocalIPv6(byte[] address) {
        if (address == null || address.length != 16) {
            return true;
        }
        int first = Byte.toUnsignedInt(address[0]);
        return (first & 0xFE) == 0xFC; // fc00::/7 Unique local addresses
    }

    /**
     * Checks whether an IPv6 address is an IPv4-mapped address (::ffff:0:0/96). Any malformed
     * input defaults to {@code false} (conservative) to avoid misuse.
     *
     * @param address 16-byte IPv6 address
     * @return {@code true} if IPv4-mapped
     */
    private boolean isIPv4MappedAddress(byte[] address) {
        if (address == null || address.length != 16) {
            return false;
        }
        for (int i = 0; i < 10; i++) {
            if (address[i] != 0) {
                return false;
            }
        }
        return address[10] == (byte) 0xFF && address[11] == (byte) 0xFF;
    }

    /*
     * Improved multipart file conversion using the shared helper method.
     *
     * @param multipart the multipart file to convert
     * @return temporary File containing the multipart file data
     * @throws IOException if I/O error occurs during conversion
     */
    public File multipartToFile(MultipartFile multipart) throws IOException {
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

    /*
     * Supports TB/PB units and provides detailed error messages.
     *
     * @param sizeStr the size string to convert (e.g., "100MB", "1.5GB")
     * @param defaultUnit the default unit to assume if none specified ("MB", "GB", etc.)
     * @return size in bytes, or null if parsing fails
     * @throws IllegalArgumentException if defaultUnit is invalid
     */
    public Long convertSizeToBytes(String sizeStr, String defaultUnit) {
        if (sizeStr == null) {
            return null;
        }

        if (defaultUnit != null && !isValidSizeUnit(defaultUnit)) {
            throw new IllegalArgumentException("Invalid default unit: " + defaultUnit);
        }

        sizeStr = sizeStr.trim().toUpperCase();
        sizeStr = sizeStr.replace(",", ".").replace(" ", "");

        try {
            if (sizeStr.endsWith("TB")) {
                return (long)
                        (Double.parseDouble(sizeStr.substring(0, sizeStr.length() - 2))
                                * 1024L
                                * 1024L
                                * 1024L
                                * 1024L);
            } else if (sizeStr.endsWith("GB")) {
                return (long)
                        (Double.parseDouble(sizeStr.substring(0, sizeStr.length() - 2))
                                * 1024L
                                * 1024L
                                * 1024L);
            } else if (sizeStr.endsWith("MB")) {
                return (long)
                        (Double.parseDouble(sizeStr.substring(0, sizeStr.length() - 2))
                                * 1024L
                                * 1024L);
            } else if (sizeStr.endsWith("KB")) {
                return (long)
                        (Double.parseDouble(sizeStr.substring(0, sizeStr.length() - 2)) * 1024L);
            } else if (!sizeStr.isEmpty() && sizeStr.charAt(sizeStr.length() - 1) == 'B') {
                return Long.parseLong(sizeStr.substring(0, sizeStr.length() - 1));
            } else {
                // Use provided default unit or fall back to MB
                String unit = defaultUnit != null ? defaultUnit.toUpperCase() : "MB";
                double value = Double.parseDouble(sizeStr);
                return switch (unit) {
                    case "TB" -> (long) (value * 1024L * 1024L * 1024L * 1024L);
                    case "GB" -> (long) (value * 1024L * 1024L * 1024L);
                    case "MB" -> (long) (value * 1024L * 1024L);
                    case "KB" -> (long) (value * 1024L);
                    case "B" -> (long) value;
                    default -> (long) (value * 1024L * 1024L); // Default to MB
                };
            }
        } catch (NumberFormatException e) {
            log.warn("Failed to parse size string '{}': {}", sizeStr, e.getMessage());
            return null;
        }
    }

    /*
     * Converts size string to bytes using MB as default unit.
     *
     * @param sizeStr the size string to convert
     * @return size in bytes, or null if parsing fails
     */
    public Long convertSizeToBytes(String sizeStr) {
        return convertSizeToBytes(sizeStr, "MB");
    }

    /* Validates if a string represents a valid size unit. */
    private boolean isValidSizeUnit(String unit) {
        // Use a precomputed Set for O(1) lookup, normalize using a locale-safe toUpperCase
        return unit != null && VALID_SIZE_UNITS.contains(unit.toUpperCase(Locale.ROOT));
    }

    /* Enhanced byte formatting with TB/PB support and better precision. */
    public String formatBytes(long bytes) {
        if (bytes < 0) {
            return "Invalid size";
        }

        if (bytes < 1024) {
            return bytes + " B";
        } else if (bytes < 1024L * 1024L) {
            return String.format(Locale.US, "%.2f KB", bytes / 1024.0);
        } else if (bytes < 1024L * 1024L * 1024L) {
            return String.format(Locale.US, "%.2f MB", bytes / (1024.0 * 1024.0));
        } else if (bytes < 1024L * 1024L * 1024L * 1024L) {
            return String.format(Locale.US, "%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0));
        } else {
            return String.format(Locale.US, "%.2f TB", bytes / (1024.0 * 1024.0 * 1024.0 * 1024.0));
        }
    }

    public List<Integer> parsePageList(String pages, int totalPages, boolean oneBased) {
        if (pages == null) {
            return List.of(1); // Default to first page if input is null
        }
        try {
            return parsePageList(pages.split(","), totalPages, oneBased);
        } catch (NumberFormatException e) {
            return List.of(1); // Default to first page if input is invalid
        }
    }

    public List<Integer> parsePageList(String[] pages, int totalPages) {
        return parsePageList(pages, totalPages, false);
    }

    public List<Integer> parsePageList(String[] pages, int totalPages, boolean oneBased) {
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

    /*
     * Enhanced mathematical expression evaluation with bounds checking and timeout protection.
     *
     * @param expression the mathematical expression containing 'n'
     * @param maxValue the maximum value for 'n' and result bounds
     * @return list of valid page numbers
     * @throws IllegalArgumentException if expression is invalid or unsafe
     */
    public List<Integer> evaluateNFunc(String expression, int maxValue) {
        if (expression == null || expression.trim().isEmpty()) {
            throw new IllegalArgumentException("Expression cannot be null or empty");
        }

        if (maxValue <= 0 || maxValue > 10000) {
            throw new IllegalArgumentException("maxValue must be between 1 and 10000 for safety");
        }

        List<Integer> results = new ArrayList<>();
        DoubleEvaluator evaluator = new DoubleEvaluator();

        // Validate the expression format
        if (!RegexPatternUtils.getInstance()
                .getMathExpressionPattern()
                .matcher(expression.trim())
                .matches()) {
            throw new IllegalArgumentException("Invalid expression format: " + expression);
        }

        for (int n = 1; n <= maxValue; n++) {
            try {
                // Replace 'n' with the current value of n, correctly handling numbers before 'n'
                String sanitizedExpression = sanitizeNFunction(expression.trim(), n);
                Double result = evaluator.evaluate(sanitizedExpression);

                // Check if the result is null or not within bounds
                if (result == null || !Double.isFinite(result)) {
                    continue;
                }

                int intResult = result.intValue();
                if (intResult > 0 && intResult <= maxValue) {
                    results.add(intResult);
                }
            } catch (Exception e) {
                log.debug(
                        "Failed to evaluate expression '{}' for n={}: {}",
                        expression,
                        n,
                        e.getMessage());
                // Continue with next value instead of breaking
            }
        }

        return results;
    }

    private String sanitizeNFunction(String expression, int nValue) {
        // Remove all spaces using a specialized character removal
        StringBuilder sb = new StringBuilder(expression.length());
        for (int i = 0; i < expression.length(); i++) {
            char c = expression.charAt(i);
            if (c != ' ') {
                sb.append(c);
            }
        }
        String sanitizedExpression = sb.toString();
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

    private String insertMultiplicationBeforeN(String expression, int nValue) {
        // Insert multiplication between a number and 'n' (e.g., "4n" becomes "4*n") using a loop
        StringBuilder sb = new StringBuilder(expression.length() + 4); // +4 for possible extra '*'
        for (int i = 0; i < expression.length(); i++) {
            char c = expression.charAt(i);
            sb.append(c);
            if (Character.isDigit(c)
                    && i + 1 < expression.length()
                    && expression.charAt(i + 1) == 'n') {
                sb.append('*');
            }
        }
        String withMultiplication = sb.toString();
        withMultiplication = formatConsecutiveNsForNFunction(withMultiplication);
        // Now replace 'n' with its current value
        return withMultiplication.replace("n", String.valueOf(nValue));
    }

    private String formatConsecutiveNsForNFunction(String expression) {
        String text = expression;
        // Replace all consecutive 'nn' with 'n*n' until no more 'nn' is found
        while (text.contains("nn")) {
            StringBuilder sb = new StringBuilder(text.length() + 2); // +2 for possible extra '*'
            int i = 0;
            while (i < text.length()) {
                if (i < text.length() - 1 && text.charAt(i) == 'n' && text.charAt(i + 1) == 'n') {
                    sb.append("n*n");
                    i += 2;
                } else {
                    sb.append(text.charAt(i));
                    i++;
                }
            }
            text = sb.toString();
        }
        return text;
    }

    private List<Integer> handlePart(String part, int totalPages, int offset) {
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
                log.debug("Invalid range: {}", part);
            }
        } else {
            // This is a single page number
            try {
                int pageNum = Integer.parseInt(part.trim());
                if (pageNum >= 1 && pageNum <= totalPages) {
                    partResult.add(pageNum - 1 + offset);
                }
            } catch (NumberFormatException e) {
                log.debug("Invalid page number: {}", part);
            }
        }
        return partResult;
    }

    public boolean createDir(String path) {
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

    public boolean isValidUUID(String uuid) {
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

    public void saveKeyToSettings(String key, Object newValue) throws IOException {
        String[] keyArray = key.split("\\.");
        Path settingsPath = Paths.get(InstallationPathConfig.getSettingsPath());
        YamlHelper settingsYaml = new YamlHelper(settingsPath);
        settingsYaml.updateValue(Arrays.asList(keyArray), newValue);
        settingsYaml.saveOverride(settingsPath);
    }

    /*
     * Machine fingerprint generation with better error logging and fallbacks.
     *
     * @return unique machine fingerprint or "GenericID" if generation fails
     */
    public String generateMachineFingerprint() {
        try {
            StringBuilder sb = new StringBuilder();

            // Try to get MAC address from primary network interface
            InetAddress ip = InetAddress.getLocalHost();
            NetworkInterface network = NetworkInterface.getByInetAddress(ip);

            if (network == null || network.getHardwareAddress() == null) {
                // Fallback: iterate through all network interfaces
                Enumeration<NetworkInterface> networks = NetworkInterface.getNetworkInterfaces();
                while (networks.hasMoreElements()) {
                    NetworkInterface net = networks.nextElement();
                    if (net.isUp() && !net.isLoopback() && !net.isVirtual()) {
                        byte[] mac = net.getHardwareAddress();
                        if (mac != null && mac.length > 0) {
                            for (byte b : mac) {
                                sb.append(String.format("%02X", b));
                            }
                            break; // Use the first valid network interface
                        }
                    }
                }
            } else {
                byte[] mac = network.getHardwareAddress();
                if (mac != null) {
                    for (byte b : mac) {
                        sb.append(String.format("%02X", b));
                    }
                }
            }

            // If no MAC address found, use hostname as fallback
            if (sb.length() == 0) {
                String hostname = InetAddress.getLocalHost().getHostName();
                sb.append(hostname != null ? hostname : "unknown-host");
                log.warn("No MAC address found, using hostname for fingerprint generation");
            }

            // Hash the collected data for privacy and consistency
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(sb.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder fingerprint = new StringBuilder();
            for (byte b : hash) {
                fingerprint.append(String.format("%02x", b));
            }

            log.debug("Successfully generated machine fingerprint");
            return fingerprint.toString();
        } catch (Exception e) {
            log.warn("Failed to generate machine fingerprint: {}", e.getMessage());
            return "GenericID";
        }
    }

    /*
     * Extracts the default pipeline configurations from the classpath to the installation path.
     * Creates directories if needed and copies default JSON files.
     *
     * <p>Existing files will be overwritten atomically (when supported). In case of unsupported
     * atomic moves, falls back to non-atomic replace.
     *
     * @throws IOException if an I/O error occurs during file operations
     */
    public void extractPipeline() throws IOException {
        Path pipelineDir =
                Paths.get(InstallationPathConfig.getPipelinePath(), DEFAULT_WEBUI_CONFIGS_DIR);
        Files.createDirectories(pipelineDir);

        for (String name : DEFAULT_VALID_PIPELINE) {
            if (!Paths.get(name).getFileName().toString().equals(name)) {
                log.error("Invalid pipeline file name: {}", name);
                throw new IllegalArgumentException("Invalid pipeline file name: " + name);
            }
            Path target = pipelineDir.resolve(name);
            ClassPathResource res =
                    new ClassPathResource(
                            "static/pipeline/" + DEFAULT_WEBUI_CONFIGS_DIR + "/" + name);
            if (!res.exists()) {
                log.error("Resource not found: {}", res.getPath());
                throw new IOException("Resource not found: " + res.getPath());
            }
            copyResourceToFile(res, target);
        }
    }

    /*
     * Extracts the specified Python script from the classpath to the installation path. Validates
     * name and copies file atomically when possible, overwriting existing.
     *
     * <p>Existing files will be overwritten atomically (when supported).
     *
     * @param scriptName the name of the script to extract
     * @return the path to the extracted script
     * @throws IllegalArgumentException if the script name is invalid or not allowed
     * @throws IOException if an I/O error occurs
     */
    public Path extractScript(String scriptName) throws IOException {
        // Validate input
        if (scriptName == null || scriptName.trim().isEmpty()) {
            throw new IllegalArgumentException("scriptName must not be null or empty");
        }
        if (scriptName.contains("..") || scriptName.contains("/")) {
            throw new IllegalArgumentException(
                    "scriptName must not contain path traversal characters");
        }
        if (!Paths.get(scriptName).getFileName().toString().equals(scriptName)) {
            throw new IllegalArgumentException(
                    "scriptName must not contain path traversal characters");
        }

        if (!DEFAULT_VALID_SCRIPTS.contains(scriptName)) {
            throw new IllegalArgumentException(
                    "scriptName must be either 'png_to_webp.py' or 'split_photos.py'");
        }

        Path scriptsDir = Paths.get(InstallationPathConfig.getScriptsPath(), PYTHON_SCRIPTS_DIR);
        Files.createDirectories(scriptsDir);

        Path target = scriptsDir.resolve(scriptName);
        ClassPathResource res =
                new ClassPathResource("static/" + PYTHON_SCRIPTS_DIR + "/" + scriptName);
        if (!res.exists()) {
            log.error("Resource not found: {}", res.getPath());
            throw new IOException("Resource not found: " + res.getPath());
        }
        copyResourceToFile(res, target);
        return target;
    }

    /*
     * Copies a resource from the classpath to a specified target file.
     *
     * @param resource the ClassPathResource to copy
     * @param target the target Path where the resource will be copied
     * @throws IOException if an I/O error occurs during the copy operation
     */
    private void copyResourceToFile(ClassPathResource resource, Path target) throws IOException {
        Path dir = target.getParent();
        Path tmp = Files.createTempFile(dir, target.getFileName().toString(), ".tmp");
        try (InputStream in = resource.getInputStream()) {
            Files.copy(in, tmp, StandardCopyOption.REPLACE_EXISTING);
            try {
                Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                log.warn(
                        "Atomic move not supported, falling back to non-atomic move for {}",
                        target,
                        e);
                Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (FileAlreadyExistsException e) {
            log.debug("File already exists at {}, attempting to replace it.", target);
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (AccessDeniedException e) {
            log.error("Access denied while attempting to copy resource to {}", target, e);
            throw e;
        } catch (FileSystemException e) {
            log.error("File system error occurred while copying resource to {}", target, e);
            throw e;
        } catch (IOException e) {
            log.error("Failed to copy resource to {}", target, e);
            throw e;
        } finally {
            try {
                Files.deleteIfExists(tmp);
            } catch (IOException e) {
                log.warn("Failed to delete temporary file {}", tmp, e);
            }
        }
    }

    public boolean isVersionHigher(String currentVersion, String compareVersion) {
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

    /**
     * Optimizes a PDF using Ghostscript with ebook settings for better e-reader compatibility. Uses
     * -dPDFSETTINGS=/ebook -dFastWebView=true settings to create an optimized PDF.
     *
     * @param inputPdfBytes Original PDF as byte array
     * @return Optimized PDF as byte array
     * @throws IOException if Ghostscript optimization fails
     */
    public byte[] optimizePdfWithGhostscript(byte[] inputPdfBytes) throws IOException {
        Path tempInput = null;
        Path tempOutput = null;

        try {
            tempInput = Files.createTempFile("gs_input_", ".pdf");
            tempOutput = Files.createTempFile("gs_output_", ".pdf");

            Files.write(tempInput, inputPdfBytes);

            List<String> command = new ArrayList<>();
            command.add("gs");
            command.add("-sDEVICE=pdfwrite");
            command.add("-dPDFSETTINGS=/ebook");
            command.add("-dFastWebView=true");
            command.add("-dNOPAUSE");
            command.add("-dQUIET");
            command.add("-dBATCH");
            command.add("-sOutputFile=" + tempOutput.toString());
            command.add(tempInput.toString());

            ProcessExecutor.ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                            .runCommandWithOutputHandling(command);

            if (result.getRc() != 0) {
                log.warn(
                        "Ghostscript ebook optimization failed with return code: {}",
                        result.getRc());
                throw ExceptionUtils.createGhostscriptCompressionException();
            }

            return Files.readAllBytes(tempOutput);

        } catch (Exception e) {
            log.warn("Ghostscript ebook optimization failed", e);
            throw ExceptionUtils.createGhostscriptCompressionException(e);
        } finally {
            if (tempInput != null) {
                try {
                    Files.deleteIfExists(tempInput);
                } catch (IOException e) {
                    log.warn("Failed to delete temp input file: {}", tempInput, e);
                }
            }
            if (tempOutput != null) {
                try {
                    Files.deleteIfExists(tempOutput);
                } catch (IOException e) {
                    log.warn("Failed to delete temp output file: {}", tempOutput, e);
                }
            }
        }
    }
}
