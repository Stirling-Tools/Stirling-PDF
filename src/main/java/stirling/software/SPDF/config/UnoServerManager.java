package stirling.software.SPDF.config;

import java.io.File;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import io.github.pixee.security.SystemCommand;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.utils.ConversionTask;

/**
 * UnoServerManager is responsible for managing multiple instances of unoserver based on application
 * configuration.
 *
 * <p>This component is only created if UnoServer is available on the system.
 */
@Slf4j
@Component
@ConditionalOnUnoServerAvailable
public class UnoServerManager {

    private static final int INSTANCE_CHECK_TIMEOUT_MS = 1000;
    private static final long INSTANCE_STARTUP_TIMEOUT_MS = 30000;
    private static final long HEALTH_CHECK_INTERVAL_MS = 60000; // Health check every minute

    @Autowired private ApplicationProperties properties;

    @Autowired private RuntimePathConfig runtimePathConfig;

    @Getter private List<ServerInstance> instances = new ArrayList<>();

    private AtomicInteger currentInstanceIndex = new AtomicInteger(0);
    private ScheduledExecutorService healthCheckExecutor;

    // The path to the UnoServer executable that was found during initialization
    private String detectedUnoServerPath;

    // Circuit breaker settings for external servers
    private static final int FAILURE_THRESHOLD = 3; // Number of failures before circuit opens
    private static final long CIRCUIT_RESET_TIME_MS = 30000; // Time before retrying a failed server

    // Performance metrics
    private final AtomicInteger totalConversions = new AtomicInteger(0);
    private final AtomicInteger failedConversions = new AtomicInteger(0);
    private final Map<Integer, AtomicInteger> conversionsPerInstance = new ConcurrentHashMap<>();

    // Queue tracking
    private final ConcurrentHashMap<String, ConversionTask> activeTasks = new ConcurrentHashMap<>();
    private final AtomicInteger taskIdCounter = new AtomicInteger(0);
    private final Map<Integer, AtomicInteger> activeTasksPerInstance = new ConcurrentHashMap<>();

    @PostConstruct
    public void initialize() {
        try {
            int maxInstances =
                    properties.getProcessExecutor().getSessionLimit().getLibreOfficeSessionLimit();
            boolean useExternal = properties.getProcessExecutor().isUseExternalUnoconvServers();
            List<String> externalServers = properties.getProcessExecutor().getUnoconvServers();
            int basePort = properties.getProcessExecutor().getBaseUnoconvPort();
            boolean manageUnoServer = properties.getProcessExecutor().isManageUnoServer();

            log.info(
                    "Initializing UnoServerManager with maxInstances: {}, useExternal: {}, externalServers: {}, unoConvertPath: {}, manageUnoServer: {}",
                    maxInstances,
                    useExternal,
                    externalServers,
                    runtimePathConfig.getUnoConvertPath(),
                    manageUnoServer);

            // Get valid UnoServer executable path
            String unoServerPath = findValidUnoServerPath();

            if (unoServerPath == null) {
                log.warn("UnoServer executable not found. Office conversions will be disabled.");
                return;
            }

            log.info("Using UnoServer at: {}", unoServerPath);

            // Store the path for use by server instances
            this.detectedUnoServerPath = unoServerPath;

            if (useExternal && !externalServers.isEmpty()) {
                // Configure for external servers
                for (String serverAddress : externalServers) {
                    String[] parts = serverAddress.split(":");
                    String host = parts[0];
                    int port = parts.length > 1 ? Integer.parseInt(parts[1]) : basePort;
                    ServerInstance instance = new ServerInstance(host, port, false);
                    instances.add(instance);
                    conversionsPerInstance.put(instances.size() - 1, new AtomicInteger(0));
                    activeTasksPerInstance.put(instances.size() - 1, new AtomicInteger(0));
                }
                log.info("Configured {} external UnoServer instances", instances.size());
            } else if (manageUnoServer) {
                // Configure for local instances only if manageUnoServer is true
                boolean anyInstanceStarted = false;

                for (int i = 0; i < maxInstances; i++) {
                    int port = basePort + i;
                    ServerInstance instance = new ServerInstance("127.0.0.1", port, true);
                    instances.add(instance);
                    conversionsPerInstance.put(i, new AtomicInteger(0));
                    activeTasksPerInstance.put(i, new AtomicInteger(0));

                    try {
                        instance.start();
                        anyInstanceStarted = true;
                    } catch (IOException e) {
                        log.warn(
                                "Failed to start UnoServer instance on port {}: {}",
                                port,
                                e.getMessage());
                    }
                }

                if (!anyInstanceStarted) {
                    log.warn(
                            "Failed to start any UnoServer instances. Office conversions may be affected.");
                }

                log.info("Started {} local UnoServer instances", instances.size());
            } else {
                log.info(
                        "Application is configured to not manage UnoServer instances. Assuming external management.");
            }

            // Start the health check scheduler
            startHealthCheck();

            // Log initial health status
            logHealthStatus();
        } catch (Exception e) {
            log.warn("Failed to initialize UnoServerManager: {}", e.getMessage(), e);
        }
    }

    /**
     * Scans multiple locations to find a valid UnoServer executable
     *
     * @return Path to UnoServer if found, null otherwise
     */
    private String findValidUnoServerPath() {
        // Common paths to check for UnoServer
        List<String> pathsToCheck = new ArrayList<>();

        // Try to derive the path from unoConvertPath first (highest priority)
        String unoConvertPath = runtimePathConfig.getUnoConvertPath();
        if (unoConvertPath != null && !unoConvertPath.isEmpty()) {
            File unoConvertFile = new File(unoConvertPath);
            if (unoConvertFile.exists() && unoConvertFile.canExecute()) {
                Path unoConvertDir = Paths.get(unoConvertPath).getParent();
                if (unoConvertDir != null) {
                    Path potentialUnoServerPath = unoConvertDir.resolve("unoserver");
                    pathsToCheck.add(potentialUnoServerPath.toString());
                }
            } else {
                log.warn("UnoConvert not found at configured path: {}", unoConvertPath);
            }
        }

        // Add common installation paths
        pathsToCheck.add("/opt/venv/bin/unoserver"); // Docker path
        pathsToCheck.add("/usr/bin/unoserver"); // Linux system path
        pathsToCheck.add("/usr/local/bin/unoserver"); // Linux local path
        pathsToCheck.add("/opt/homebrew/bin/unoserver"); // Mac Homebrew path
        pathsToCheck.add("/opt/libreoffice/program/unoserver"); // Custom LibreOffice path

        // Check each path
        for (String path : pathsToCheck) {
            File file = new File(path);
            if (file.exists() && file.canExecute()) {
                log.info("Found valid UnoServer at: {}", path);
                return path;
            }
        }

        // If no absolute path works, try to find it in PATH
        String pathEnv = System.getenv("PATH");
        if (pathEnv != null) {
            String[] pathDirs = pathEnv.split(File.pathSeparator);
            for (String pathDir : pathDirs) {
                File file = new File(pathDir, "unoserver");
                if (file.exists() && file.canExecute()) {
                    log.info("Found UnoServer in PATH at: {}", file.getAbsolutePath());
                    return file.getAbsolutePath();
                }
            }
        }

        log.warn("UnoServer executable not found in any standard location");
        return null;
    }

    /** Starts periodic health checks for all instances */
    private void startHealthCheck() {
        healthCheckExecutor = Executors.newSingleThreadScheduledExecutor();
        healthCheckExecutor.scheduleAtFixedRate(
                this::performHealthCheck,
                HEALTH_CHECK_INTERVAL_MS,
                HEALTH_CHECK_INTERVAL_MS,
                TimeUnit.MILLISECONDS);
    }

    /** Perform health check on all instances */
    private void performHealthCheck() {
        log.debug("Running UnoServer health check for {} instances", instances.size());
        int healthy = 0;
        int unhealthy = 0;

        for (int i = 0; i < instances.size(); i++) {
            ServerInstance instance = instances.get(i);
            boolean isRunning = instance.isRunning();

            if (isRunning) {
                healthy++;
                instance.resetFailureCount(); // Reset failure count for healthy instance
            } else {
                unhealthy++;
                log.warn(
                        "UnoServer instance {}:{} is not running",
                        instance.getHost(),
                        instance.getPort());

                // For managed instances, try to restart if needed
                if (instance.isManaged()) {
                    try {
                        instance.restartIfNeeded();
                    } catch (Exception e) {
                        log.error(
                                "Failed to restart UnoServer instance {}:{}",
                                instance.getHost(),
                                instance.getPort(),
                                e);
                    }
                }
            }
        }

        log.info("UnoServer health check: {} healthy, {} unhealthy instances", healthy, unhealthy);

        // Log metrics periodically
        logMetrics();
    }

    /** Logs the current health status of all instances */
    private void logHealthStatus() {
        StringBuilder status = new StringBuilder("UnoServer Instances Status:\n");

        for (int i = 0; i < instances.size(); i++) {
            ServerInstance instance = instances.get(i);
            boolean isRunning = instance.isRunning();
            int convCount = conversionsPerInstance.get(i).get();

            status.append(
                    String.format(
                            "  [%d] %s:%d - Status: %s, Managed: %s, Conversions: %d, Failures: %d\n",
                            i,
                            instance.getHost(),
                            instance.getPort(),
                            isRunning ? "RUNNING" : "DOWN",
                            instance.isManaged() ? "YES" : "NO",
                            convCount,
                            instance.getFailureCount()));
        }

        log.info(status.toString());
    }

    /** Logs performance metrics for UnoServer conversions */
    private void logMetrics() {
        int total = totalConversions.get();
        int failed = failedConversions.get();
        float successRate = total > 0 ? (float) (total - failed) / total * 100 : 0;

        log.info(
                "UnoServer metrics - Total: {}, Failed: {}, Success Rate: {:.2f}%",
                total, failed, successRate);

        // Log per-instance metrics
        StringBuilder instanceMetrics = new StringBuilder("Conversions per instance:\n");
        for (int i = 0; i < instances.size(); i++) {
            ServerInstance instance = instances.get(i);
            int count = conversionsPerInstance.get(i).get();
            float percentage = total > 0 ? (float) count / total * 100 : 0;

            instanceMetrics.append(
                    String.format(
                            "  [%d] %s:%d - Count: %d (%.2f%%), Avg Time: %.2fms\n",
                            i,
                            instance.getHost(),
                            instance.getPort(),
                            count,
                            percentage,
                            instance.getAverageConversionTime()));
        }

        log.info(instanceMetrics.toString());
    }

    @PreDestroy
    public void cleanup() {
        log.info("Shutting down UnoServer instances and health check scheduler");

        // Shutdown health check scheduler
        if (healthCheckExecutor != null) {
            healthCheckExecutor.shutdownNow();
        }

        // Shutdown all instances
        for (ServerInstance instance : instances) {
            instance.stop();
        }

        // Log final metrics
        logMetrics();
    }

    /**
     * Gets the next available server instance using load-balancing and circuit breaker pattern for
     * fault tolerance
     *
     * @return The next UnoServer instance to use
     */
    public ServerInstance getNextInstance() {
        if (instances.isEmpty()) {
            throw new IllegalStateException("No UnoServer instances available");
        }

        // First try to find a healthy instance with the least active tasks
        int minActiveTasks = Integer.MAX_VALUE;
        int selectedIndex = -1;

        for (int i = 0; i < instances.size(); i++) {
            ServerInstance instance = instances.get(i);

            // Check if instance is available (not in circuit-open state)
            if (instance.isAvailable() && instance.isRunning()) {
                int activeTasks = activeTasksPerInstance.get(i).get();

                // If this instance has fewer active tasks, select it
                if (activeTasks < minActiveTasks) {
                    minActiveTasks = activeTasks;
                    selectedIndex = i;

                    // If we found an instance with no active tasks, use it immediately
                    if (minActiveTasks == 0) {
                        break;
                    }
                }
            }
        }

        // If we found a suitable instance, use it
        if (selectedIndex >= 0) {
            ServerInstance instance = instances.get(selectedIndex);

            // Track this instance being selected
            conversionsPerInstance.get(selectedIndex).incrementAndGet();
            activeTasksPerInstance.get(selectedIndex).incrementAndGet();
            totalConversions.incrementAndGet();

            log.debug(
                    "Selected UnoServer instance {}:{} with {} active tasks",
                    instance.getHost(),
                    instance.getPort(),
                    minActiveTasks);

            return instance;
        }

        // If all healthy instances are busy or no healthy instances found, use round-robin as
        // fallback
        log.warn(
                "No available UnoServer instances found with good health. Using round-robin fallback.");

        // Try to find any available instance using round-robin
        for (int attempt = 0; attempt < instances.size(); attempt++) {
            int index = currentInstanceIndex.getAndIncrement() % instances.size();
            ServerInstance instance = instances.get(index);

            // Check if the instance is available (circuit closed)
            if (instance.isAvailable()) {
                // Track this instance being selected
                conversionsPerInstance.get(index).incrementAndGet();
                activeTasksPerInstance.get(index).incrementAndGet();
                totalConversions.incrementAndGet();

                log.debug(
                        "Selected UnoServer instance {}:{} using round-robin fallback",
                        instance.getHost(),
                        instance.getPort());

                return instance;
            }
        }

        // Last resort - if all circuits are open, use the next instance anyway
        int index = currentInstanceIndex.get() % instances.size();
        ServerInstance instance = instances.get(index);

        log.warn(
                "All UnoServer instances are in circuit-open state. Using instance at {}:{} as fallback.",
                instance.getHost(),
                instance.getPort());

        // Track metrics even for fallback case
        conversionsPerInstance.get(index).incrementAndGet();
        activeTasksPerInstance.get(index).incrementAndGet();
        totalConversions.incrementAndGet();

        return instance;
    }

    /**
     * Creates a new task for tracking office conversions
     *
     * @param taskName A descriptive name for the task
     * @param instance The server instance that will handle this task
     * @return A unique task ID for tracking
     */
    public String createTask(String taskName, ServerInstance instance) {
        String taskId = "office-" + taskIdCounter.incrementAndGet();
        ConversionTask task = new ConversionTask(taskName, taskId);
        
        // Calculate queue position based on number of active tasks across all instances
        int runningTasks = 0;
        int availableInstances = 0;
        
        for (int i = 0; i < instances.size(); i++) {
            if (instances.get(i).isRunning() && instances.get(i).isAvailable()) {
                availableInstances++;
                runningTasks += activeTasksPerInstance.get(i).get();
            }
        }
        
        // If all instances are busy, set a queue position
        if (runningTasks >= availableInstances && availableInstances > 0) {
            int queuePosition = runningTasks - availableInstances + 1;
            task.setQueuePosition(queuePosition);
        }

        // Store the task in our tracking map
        activeTasks.put(taskId, task);

        // Find the instance index for updating metrics
        for (int i = 0; i < instances.size(); i++) {
            if (instances.get(i) == instance) {
                activeTasksPerInstance.get(i).incrementAndGet();
                break;
            }
        }

        log.debug("Created task {} with ID {}", taskName, taskId);
        return taskId;
    }

    /**
     * Completes a task, updating metrics and removing it from active tasks
     *
     * @param taskId The task ID to complete
     * @param instance The server instance that handled this task
     * @param durationMs The time taken to complete the task in milliseconds
     */
    public void completeTask(String taskId, ServerInstance instance, long durationMs) {
        ConversionTask task = activeTasks.remove(taskId);
        if (task != null) {
            task.complete();
        }

        // Find the instance index for updating metrics
        for (int i = 0; i < instances.size(); i++) {
            if (instances.get(i) == instance) {
                activeTasksPerInstance.get(i).decrementAndGet();
                break;
            }
        }

        // Record the success for circuit breaker and metrics
        recordSuccess(instance, durationMs);

        log.debug("Completed task with ID {}, duration: {}ms", taskId, durationMs);
    }

    /**
     * Fails a task, updating metrics and removing it from active tasks
     *
     * @param taskId The task ID to fail
     * @param instance The server instance that handled this task
     * @param errorMessage The error message explaining the failure
     */
    public void failTask(String taskId, ServerInstance instance, String errorMessage) {
        ConversionTask task = activeTasks.remove(taskId);
        if (task != null) {
            task.fail(errorMessage);
        }

        // Find the instance index for updating metrics
        for (int i = 0; i < instances.size(); i++) {
            if (instances.get(i) == instance) {
                activeTasksPerInstance.get(i).decrementAndGet();
                break;
            }
        }

        // Record the failure for circuit breaker and metrics
        recordFailure(instance);

        log.warn("Failed task with ID {}: {}", taskId, errorMessage);
    }

    /**
     * Gets all active conversion tasks
     *
     * @return A map of task IDs to ConversionTask objects
     */
    public Map<String, ConversionTask> getActiveTasks() {
        return new HashMap<>(activeTasks);
    }

    /**
     * Records a successful conversion for metrics
     *
     * @param instance The server instance that succeeded
     * @param durationMs The time taken for the conversion in milliseconds
     */
    public void recordSuccess(ServerInstance instance, long durationMs) {
        instance.recordSuccess(durationMs);
    }

    /**
     * Records a failed conversion for metrics and circuit breaker
     *
     * @param instance The server instance that failed
     */
    public void recordFailure(ServerInstance instance) {
        failedConversions.incrementAndGet();
        instance.recordFailure();
    }

    /** Represents a single UnoServer instance with circuit breaker functionality */
    public class ServerInstance {
        @Getter private final String host;
        @Getter private final int port;
        @Getter private final boolean managed;
        private ExecutorService executorService;
        private Process process;
        private boolean running = false;

        // Circuit breaker state
        private final AtomicInteger failureCount = new AtomicInteger(0);
        private volatile Instant lastFailureTime = null;
        private volatile boolean circuitOpen = false;

        // Performance metrics
        private final AtomicLong totalConversionTimeMs = new AtomicLong(0);
        private final AtomicInteger conversionCount = new AtomicInteger(0);
        private final AtomicLong lastConversionDuration = new AtomicLong(0);

        public ServerInstance(String host, int port, boolean managed) {
            this.host = host;
            this.port = port;
            this.managed = managed;
            if (!managed) {
                // For external servers, we assume they're running initially
                this.running = true;
            }
        }

        /** Gets the number of failures for circuit breaker */
        public int getFailureCount() {
            return failureCount.get();
        }

        /** Resets the failure count for circuit breaker */
        public void resetFailureCount() {
            failureCount.set(0);
            circuitOpen = false;
        }

        /**
         * Records a successful conversion
         *
         * @param durationMs The duration of the conversion in milliseconds
         */
        public void recordSuccess(long durationMs) {
            conversionCount.incrementAndGet();
            totalConversionTimeMs.addAndGet(durationMs);
            lastConversionDuration.set(durationMs);

            // Reset failure count on success
            resetFailureCount();
        }

        /** Records a conversion failure */
        public void recordFailure() {
            int currentFailures = failureCount.incrementAndGet();
            lastFailureTime = Instant.now();

            // Open circuit if threshold reached
            if (currentFailures >= FAILURE_THRESHOLD) {
                log.warn(
                        "Circuit breaker opened for UnoServer instance {}:{} after {} failures",
                        host,
                        port,
                        currentFailures);
                circuitOpen = true;
            }
        }

        /**
         * Checks if this instance is available based on circuit breaker status
         *
         * @return true if available, false if circuit is open
         */
        public boolean isAvailable() {
            // If circuit is closed, instance is available
            if (!circuitOpen) {
                return true;
            }

            // If circuit is open but reset time has passed, try half-open state
            if (lastFailureTime != null
                    && Duration.between(lastFailureTime, Instant.now()).toMillis()
                            > CIRCUIT_RESET_TIME_MS) {
                log.info("Circuit breaker half-open for UnoServer instance {}:{}", host, port);
                circuitOpen = false;
                return true;
            }

            // Circuit is open
            return false;
        }

        /**
         * Gets the average conversion time in milliseconds
         *
         * @return The average conversion time or 0 if no conversions yet
         */
        public double getAverageConversionTime() {
            int count = conversionCount.get();
            return count > 0 ? (double) totalConversionTimeMs.get() / count : 0;
        }

        /**
         * Gets the last conversion duration in milliseconds
         *
         * @return The last conversion duration
         */
        public long getLastConversionDuration() {
            return lastConversionDuration.get();
        }

        /**
         * Checks if the UnoServer instance is running
         *
         * @return true if the server is accessible, false otherwise
         */
        public boolean isRunning() {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host, port), INSTANCE_CHECK_TIMEOUT_MS);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /**
         * Starts the UnoServer if it's a managed instance
         *
         * @throws IOException if the server fails to start
         */
        public synchronized void start() throws IOException {
            if (!managed
                    || (process != null && process.isAlive())
                    || !properties.getProcessExecutor().isManageUnoServer()) {
                return;
            }

            log.info("Starting UnoServer on {}:{}", host, port);

            try {
                // Use the detected UnoServer path from parent class
                String unoServerPath = UnoServerManager.this.detectedUnoServerPath;

                // If not available (shouldn't happen), try to determine it
                if (unoServerPath == null || unoServerPath.isEmpty()) {
                    log.warn(
                            "detectedUnoServerPath is null, attempting to find unoserver executable");
                    unoServerPath = findUnoServerExecutable();

                    if (unoServerPath == null) {
                        throw new IOException(
                                "UnoServer executable not found. Cannot start server instance.");
                    }
                }

                log.debug("Using UnoServer executable: {}", unoServerPath);

                // Create the command with the correct path and options
                String command =
                        String.format("%s --port %d --interface %s", unoServerPath, port, host);

                // Final verification that the executable exists and is executable
                File executableFile = new File(unoServerPath);
                if (!executableFile.exists() || !executableFile.canExecute()) {
                    throw new IOException(
                            "UnoServer executable not found or not executable at: "
                                    + executableFile.getAbsolutePath());
                }

                // Run the command
                log.debug("Executing command: {}", command);
                process = SystemCommand.runCommand(Runtime.getRuntime(), command);

                // Start a background thread to monitor the process
                executorService = Executors.newSingleThreadExecutor();
                executorService.submit(
                        () -> {
                            try {
                                int exitCode = process.waitFor();
                                log.info(
                                        "UnoServer process on port {} exited with code {}",
                                        port,
                                        exitCode);
                                running = false;
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                                log.warn("UnoServer monitoring thread was interrupted", e);
                            }
                        });

                // Wait for the server to start up with timeout
                long startTime = System.currentTimeMillis();
                boolean startupSuccess = false;

                while (System.currentTimeMillis() - startTime < INSTANCE_STARTUP_TIMEOUT_MS) {
                    if (isRunning()) {
                        running = true;
                        startupSuccess = true;
                        log.info("UnoServer started successfully on {}:{}", host, port);
                        break;
                    }

                    // Check if process is still alive
                    if (process == null || !process.isAlive()) {
                        int exitCode = process != null ? process.exitValue() : -1;
                        log.warn(
                                "UnoServer process terminated prematurely with exit code: {}, continuing without it",
                                exitCode);
                        return;
                    }

                    try {
                        Thread.sleep(1000); // Check every second
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        log.warn("Interrupted while waiting for UnoServer to start", e);
                        return;
                    }
                }

                if (!startupSuccess) {
                    // Timeout occurred, clean up and log warning
                    if (process != null && process.isAlive()) {
                        process.destroy();
                    }
                    log.warn(
                            "Failed to start UnoServer within timeout period of {} seconds, continuing without it",
                            (INSTANCE_STARTUP_TIMEOUT_MS / 1000));
                }
            } catch (IOException e) {
                log.warn("Failed to start UnoServer: {}, continuing without it", e.getMessage());
                // Don't rethrow - continue without the server
            }
        }

        /**
         * Helper method to find the UnoServer executable
         *
         * @return Path to UnoServer executable or null if not found
         */
        private String findUnoServerExecutable() {
            // Try to derive from unoConvertPath first
            String unoConvertPath = UnoServerManager.this.runtimePathConfig.getUnoConvertPath();
            if (unoConvertPath != null && !unoConvertPath.isEmpty()) {
                Path unoConvertDir = Paths.get(unoConvertPath).getParent();
                if (unoConvertDir != null) {
                    Path potentialUnoServerPath = unoConvertDir.resolve("unoserver");
                    File unoServerFile = potentialUnoServerPath.toFile();

                    if (unoServerFile.exists() && unoServerFile.canExecute()) {
                        return potentialUnoServerPath.toString();
                    }
                }
            }

            // Check common paths
            String[] commonPaths = {
                "/opt/venv/bin/unoserver", "/usr/bin/unoserver", "/usr/local/bin/unoserver"
            };

            for (String path : commonPaths) {
                File file = new File(path);
                if (file.exists() && file.canExecute()) {
                    return path;
                }
            }

            return null;
        }

        /** Stops the UnoServer if it's a managed instance */
        public synchronized void stop() {
            if (!managed) {
                return;
            }

            // Stop the monitoring thread
            if (executorService != null) {
                executorService.shutdownNow();
            }

            // Stop the server process
            if (process != null && process.isAlive()) {
                log.info("Stopping UnoServer on port {}", port);
                process.destroy();
            }
            running = false;
        }

        /**
         * Restarts the UnoServer if it's a managed instance and not running
         *
         * @return true if restart succeeded or wasn't needed, false otherwise
         */
        public synchronized boolean restartIfNeeded() {
            if (!managed || running || !properties.getProcessExecutor().isManageUnoServer()) {
                return true;
            }

            try {
                log.info("Attempting to restart UnoServer on {}:{}", host, port);
                start();
                return true;
            } catch (IOException e) {
                log.warn("Failed to restart UnoServer on port {}, continuing without it", port, e);
                return false;
            }
        }

        /**
         * Gets the connection string for this instance
         *
         * @return A connection string in the format host:port
         */
        public String getConnectionString() {
            return host + ":" + port;
        }
    }
}
