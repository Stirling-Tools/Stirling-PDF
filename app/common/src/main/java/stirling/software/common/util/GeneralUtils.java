package stirling.software.common.util;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.management.ManagementFactory;
import java.net.*;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantReadWriteLock;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.core.io.support.ResourcePatternUtils;
import org.springframework.web.multipart.MultipartFile;

import com.fathzer.soft.javaluator.DoubleEvaluator;

import io.github.pixee.security.HostValidator;
import io.github.pixee.security.Urls;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;

@Slf4j
public class GeneralUtils {

    private static final List<String> DEFAULT_VALID_SCRIPTS =
            List.of("png_to_webp.py", "split_photos.py");

    // Concurrency control for settings file operations
    private static final ReentrantReadWriteLock settingsLock =
            new ReentrantReadWriteLock(true); // fair locking
    private static volatile String lastSettingsHash = null;

    // Lock timeout configuration
    private static final long LOCK_TIMEOUT_SECONDS = 30; // Maximum time to wait for locks
    private static final long FILE_LOCK_TIMEOUT_MS = 1000; // File lock timeout

    // Track active file locks for diagnostics
    private static final ConcurrentHashMap<String, String> activeLocks = new ConcurrentHashMap<>();

    // Configuration flag for force bypass mode
    private static final boolean FORCE_BYPASS_EXTERNAL_LOCKS =
            Boolean.parseBoolean(
                    System.getProperty("stirling.settings.force-bypass-locks", "true"));

    // Initialize settings hash on first access
    static {
        try {
            lastSettingsHash = calculateSettingsHash();
        } catch (Exception e) {
            log.warn("Could not initialize settings hash: {}", e.getMessage());
            lastSettingsHash = "";
        }
    }

    public static File convertMultipartFileToFile(MultipartFile multipartFile) throws IOException {
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
            return String.format(Locale.US, "%.2f KB", bytes / 1024.0);
        } else if (bytes < 1024 * 1024 * 1024) {
            return String.format(Locale.US, "%.2f MB", bytes / (1024.0 * 1024.0));
        } else {
            return String.format(Locale.US, "%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0));
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

    /**
     * Thread-safe method to save a key-value pair to settings file with concurrency control.
     * Prevents race conditions and data corruption when multiple threads/admins modify settings.
     *
     * @param key The setting key in dot notation (e.g., "security.enableCSRF")
     * @param newValue The new value to set
     * @throws IOException If file operations fail
     * @throws IllegalStateException If settings file was modified by another process
     */
    public static void saveKeyToSettings(String key, Object newValue) throws IOException {
        // Use timeout to prevent infinite blocking
        boolean lockAcquired = false;
        try {
            lockAcquired = settingsLock.writeLock().tryLock(LOCK_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!lockAcquired) {
                throw new IOException(
                        String.format(
                                "Could not acquire write lock for setting '%s' within %d seconds. "
                                        + "Another admin operation may be in progress or the system may be under heavy load.",
                                key, LOCK_TIMEOUT_SECONDS));
            }
            Path settingsPath = Paths.get(InstallationPathConfig.getSettingsPath());

            // Get current thread and process info for diagnostics
            String currentThread = Thread.currentThread().getName();
            String currentProcess = ManagementFactory.getRuntimeMXBean().getName();
            String lockAttemptInfo =
                    String.format(
                            "Thread:%s Process:%s Setting:%s", currentThread, currentProcess, key);

            log.debug(
                    "Attempting to acquire file lock for setting '{}' from {}",
                    key,
                    lockAttemptInfo);

            // Check what locks are currently active
            if (!activeLocks.isEmpty()) {
                log.debug("Active locks detected: {}", activeLocks);
            }

            // Attempt file locking with proper retry logic
            long startTime = System.currentTimeMillis();
            int retryCount = 0;
            final int maxRetries = (int) (FILE_LOCK_TIMEOUT_MS / 100); // 100ms intervals

            while ((System.currentTimeMillis() - startTime) < FILE_LOCK_TIMEOUT_MS) {
                FileChannel channel = null;
                FileLock fileLock = null;

                try {
                    // Open channel and keep it open during lock attempts
                    channel =
                            FileChannel.open(
                                    settingsPath,
                                    StandardOpenOption.READ,
                                    StandardOpenOption.WRITE,
                                    StandardOpenOption.CREATE);

                    // Try to acquire exclusive lock
                    fileLock = channel.tryLock();

                    if (fileLock != null) {
                        // Successfully acquired lock - track it for diagnostics
                        String lockInfo =
                                String.format(
                                        "%s acquired at %d",
                                        lockAttemptInfo, System.currentTimeMillis());
                        activeLocks.put(settingsPath.toString(), lockInfo);

                        // Successfully acquired lock - perform the update
                        try {
                            // Validate that we can actually read/write to detect stale locks
                            if (!Files.isWritable(settingsPath)) {
                                throw new IOException(
                                        "Settings file is not writable - permissions issue");
                            }

                            // Perform the actual update
                            String[] keyArray = key.split("\\.");
                            YamlHelper settingsYaml = new YamlHelper(settingsPath);
                            settingsYaml.updateValue(Arrays.asList(keyArray), newValue);
                            settingsYaml.saveOverride(settingsPath);

                            // Update hash after successful write
                            lastSettingsHash = null; // Will be recalculated on next access

                            log.debug(
                                    "Successfully updated setting: {} = {} (attempt {}) by {}",
                                    key,
                                    newValue,
                                    retryCount + 1,
                                    lockAttemptInfo);
                            return; // Success - exit method

                        } finally {
                            // Remove from active locks tracking
                            activeLocks.remove(settingsPath.toString());

                            // Ensure file lock is always released
                            if (fileLock.isValid()) {
                                fileLock.release();
                            }
                        }
                    } else {
                        // Lock not available - log diagnostic info
                        retryCount++;
                        log.debug(
                                "File lock not available for setting '{}', attempt {} of {} by {}. Active locks: {}",
                                key,
                                retryCount,
                                maxRetries,
                                lockAttemptInfo,
                                activeLocks.isEmpty() ? "none" : activeLocks);

                        // Wait before retry with exponential backoff (100ms, 150ms, 200ms, etc.)
                        long waitTime = Math.min(100 + (retryCount * 50), 500);
                        Thread.sleep(waitTime);
                    }

                } catch (OverlappingFileLockException e) {
                    // This specific exception means another thread in the same JVM has the lock
                    retryCount++;
                    log.debug(
                            "Overlapping file lock detected for setting '{}', attempt {} of {} by {}. Another thread in this JVM has the lock. Active locks: {}",
                            key,
                            retryCount,
                            maxRetries,
                            lockAttemptInfo,
                            activeLocks);

                    try {
                        // Wait before retry with exponential backoff
                        long waitTime = Math.min(100 + (retryCount * 50), 500);
                        Thread.sleep(waitTime);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw new IOException("Interrupted while waiting for file lock retry", ie);
                    }
                } catch (IOException e) {
                    // If this is a specific lock contention error, continue retrying
                    if (e.getMessage() != null
                            && (e.getMessage().contains("locked")
                                    || e.getMessage().contains("another process")
                                    || e.getMessage().contains("sharing violation"))) {

                        retryCount++;
                        log.debug(
                                "File lock contention for setting '{}', attempt {} of {} by {}. IOException: {}. Active locks: {}",
                                key,
                                retryCount,
                                maxRetries,
                                lockAttemptInfo,
                                e.getMessage(),
                                activeLocks);

                        try {
                            // Wait before retry with exponential backoff
                            long waitTime = Math.min(100 + (retryCount * 50), 500);
                            Thread.sleep(waitTime);
                        } catch (InterruptedException ie) {
                            Thread.currentThread().interrupt();
                            throw new IOException(
                                    "Interrupted while waiting for file lock retry", ie);
                        }
                    } else {
                        // Different type of IOException - don't retry
                        throw e;
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IOException("Interrupted while waiting for file lock", e);
                } finally {
                    // Clean up resources
                    if (fileLock != null && fileLock.isValid()) {
                        try {
                            fileLock.release();
                        } catch (IOException e) {
                            log.warn(
                                    "Failed to release file lock for setting {}: {}",
                                    key,
                                    e.getMessage());
                        }
                    }
                    if (channel != null && channel.isOpen()) {
                        try {
                            channel.close();
                        } catch (IOException e) {
                            log.warn(
                                    "Failed to close file channel for setting {}: {}",
                                    key,
                                    e.getMessage());
                        }
                    }
                }
            }

            // If we get here, we couldn't acquire the file lock within timeout
            // If no internal locks are active, this is likely an external system lock
            // Try one final force write attempt if bypass is enabled
            if (FORCE_BYPASS_EXTERNAL_LOCKS && activeLocks.isEmpty()) {
                log.debug(
                        "No internal locks detected - attempting force write bypass for setting '{}' due to external system lock (bypass enabled)",
                        key);
                try {
                    // Attempt direct file write without locking
                    String[] keyArray = key.split("\\.");
                    YamlHelper settingsYaml = new YamlHelper(settingsPath);
                    settingsYaml.updateValue(Arrays.asList(keyArray), newValue);
                    settingsYaml.saveOverride(settingsPath);

                    // Update hash after successful write
                    lastSettingsHash = null;

                    log.debug(
                            "Force write bypass successful for setting '{}' = {} (external system lock detected)",
                            key,
                            newValue);
                    return; // Success

                } catch (Exception forceWriteException) {
                    log.error(
                            "Force write bypass failed for setting '{}': {}",
                            key,
                            forceWriteException.getMessage());
                    // Fall through to original exception
                }
            } else if (!FORCE_BYPASS_EXTERNAL_LOCKS && activeLocks.isEmpty()) {
                log.debug(
                        "External system lock detected for setting '{}' but force bypass is disabled (use -Dstirling.settings.force-bypass-locks=true to enable)",
                        key);
            }

            throw new IOException(
                    String.format(
                            "Could not acquire file lock for setting '%s' within %d ms by %s. "
                                    + "The settings file may be locked by another process or there may be file system issues. "
                                    + "Final active locks: %s. Force bypass %s",
                            key,
                            FILE_LOCK_TIMEOUT_MS,
                            lockAttemptInfo,
                            activeLocks,
                            activeLocks.isEmpty()
                                    ? "attempted but failed"
                                    : "not attempted (internal locks detected)"));

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted while waiting for settings lock", e);
        } catch (Exception e) {
            log.error("Unexpected error updating setting {}: {}", key, e.getMessage(), e);
            if (e instanceof IOException) {
                throw (IOException) e;
            }
            throw new IOException("Failed to update settings: " + e.getMessage(), e);
        } finally {
            if (lockAcquired) {
                settingsLock.writeLock().unlock();

                // Recalculate hash after releasing the write lock
                try {
                    if (lastSettingsHash == null) {
                        lastSettingsHash = calculateSettingsHash();
                        log.debug("Updated settings hash after write operation");
                    }
                } catch (Exception e) {
                    log.warn("Failed to update settings hash after write: {}", e.getMessage());
                    lastSettingsHash = "";
                }
            }
        }
    }

    /**
     * Calculates MD5 hash of the settings file for change detection
     *
     * @return Hash string, or empty string if file doesn't exist
     */
    private static String calculateSettingsHash() throws Exception {
        Path settingsPath = Paths.get(InstallationPathConfig.getSettingsPath());
        if (!Files.exists(settingsPath)) {
            return "";
        }

        boolean lockAcquired = false;
        try {
            lockAcquired = settingsLock.readLock().tryLock(LOCK_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!lockAcquired) {
                throw new IOException(
                        String.format(
                                "Could not acquire read lock for settings hash calculation within %d seconds. "
                                        + "System may be under heavy load or there may be a deadlock.",
                                LOCK_TIMEOUT_SECONDS));
            }

            // Use OS-level file locking with proper retry logic
            long startTime = System.currentTimeMillis();
            int retryCount = 0;
            final int maxRetries = (int) (FILE_LOCK_TIMEOUT_MS / 100); // 100ms intervals

            while ((System.currentTimeMillis() - startTime) < FILE_LOCK_TIMEOUT_MS) {
                FileChannel channel = null;
                FileLock fileLock = null;

                try {
                    // Open channel and keep it open during lock attempts
                    channel = FileChannel.open(settingsPath, StandardOpenOption.READ);

                    // Try to acquire shared lock for reading
                    fileLock = channel.tryLock(0L, Long.MAX_VALUE, true);

                    if (fileLock != null) {
                        // Successfully acquired lock - calculate hash
                        try {
                            byte[] fileBytes = Files.readAllBytes(settingsPath);
                            MessageDigest md = MessageDigest.getInstance("MD5");
                            byte[] hashBytes = md.digest(fileBytes);

                            StringBuilder sb = new StringBuilder();
                            for (byte b : hashBytes) {
                                sb.append(String.format("%02x", b));
                            }
                            log.debug(
                                    "Successfully calculated settings hash (attempt {})",
                                    retryCount + 1);
                            return sb.toString();
                        } finally {
                            fileLock.release();
                        }
                    } else {
                        // Lock not available - log and retry
                        retryCount++;
                        log.debug(
                                "File lock not available for hash calculation, attempt {} of {}",
                                retryCount,
                                maxRetries);

                        // Wait before retry with exponential backoff
                        long waitTime = Math.min(100 + (retryCount * 50), 500);
                        Thread.sleep(waitTime);
                    }

                } catch (IOException e) {
                    // If this is a specific lock contention error, continue retrying
                    if (e.getMessage() != null
                            && (e.getMessage().contains("locked")
                                    || e.getMessage().contains("another process")
                                    || e.getMessage().contains("sharing violation"))) {

                        retryCount++;
                        log.debug(
                                "File lock contention for hash calculation, attempt {} of {}: {}",
                                retryCount,
                                maxRetries,
                                e.getMessage());

                        try {
                            // Wait before retry with exponential backoff
                            long waitTime = Math.min(100 + (retryCount * 50), 500);
                            Thread.sleep(waitTime);
                        } catch (InterruptedException ie) {
                            Thread.currentThread().interrupt();
                            throw new IOException(
                                    "Interrupted while waiting for file lock retry", ie);
                        }
                    } else {
                        // Different type of IOException - don't retry
                        throw e;
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IOException("Interrupted while waiting for file lock", e);
                } finally {
                    // Clean up resources
                    if (fileLock != null && fileLock.isValid()) {
                        try {
                            fileLock.release();
                        } catch (IOException e) {
                            log.warn(
                                    "Failed to release file lock for hash calculation: {}",
                                    e.getMessage());
                        }
                    }
                    if (channel != null && channel.isOpen()) {
                        try {
                            channel.close();
                        } catch (IOException e) {
                            log.warn(
                                    "Failed to close file channel for hash calculation: {}",
                                    e.getMessage());
                        }
                    }
                }
            }

            // If we couldn't get the file lock, throw an exception
            throw new IOException(
                    String.format(
                            "Could not acquire file lock for settings hash calculation within %d ms. "
                                    + "The settings file may be locked by another process.",
                            FILE_LOCK_TIMEOUT_MS));

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException(
                    "Interrupted while waiting for settings read lock for hash calculation", e);
        } finally {
            if (lockAcquired) {
                settingsLock.readLock().unlock();
            }
        }
    }

    /**
     * Thread-safe method to read settings values with proper locking and timeout
     *
     * @return YamlHelper instance for reading
     * @throws IOException If timeout occurs or file operations fail
     */
    public static YamlHelper getSettingsReader() throws IOException {
        boolean lockAcquired = false;
        try {
            lockAcquired = settingsLock.readLock().tryLock(LOCK_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!lockAcquired) {
                throw new IOException(
                        String.format(
                                "Could not acquire read lock for settings within %d seconds. "
                                        + "System may be under heavy load or there may be a deadlock.",
                                LOCK_TIMEOUT_SECONDS));
            }

            Path settingsPath = Paths.get(InstallationPathConfig.getSettingsPath());
            return new YamlHelper(settingsPath);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted while waiting for settings read lock", e);
        } finally {
            if (lockAcquired) {
                settingsLock.readLock().unlock();
            }
        }
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

    /**
     * Extracts a file from classpath:/static/python to a temporary directory and returns the path.
     */
    public static Path extractScript(String scriptName) throws IOException {
        // Validate input
        if (scriptName == null || scriptName.trim().isEmpty()) {
            throw new IllegalArgumentException("scriptName must not be null or empty");
        }
        if (scriptName.contains("..") || scriptName.contains("/")) {
            throw new IllegalArgumentException(
                    "scriptName must not contain path traversal characters");
        }

        if (!DEFAULT_VALID_SCRIPTS.contains(scriptName)) {
            throw new IllegalArgumentException(
                    "scriptName must be either 'png_to_webp.py' or 'split_photos.py'");
        }

        Path scriptsDir = Paths.get(InstallationPathConfig.getScriptsPath(), "python");
        Files.createDirectories(scriptsDir);

        Path scriptFile = scriptsDir.resolve(scriptName);
        if (!Files.exists(scriptFile)) {
            ClassPathResource resource = new ClassPathResource("static/python/" + scriptName);
            try (InputStream in = resource.getInputStream()) {
                Files.copy(in, scriptFile, StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException e) {
                log.error("Failed to extract Python script", e);
                throw e;
            }
        }
        return scriptFile;
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
