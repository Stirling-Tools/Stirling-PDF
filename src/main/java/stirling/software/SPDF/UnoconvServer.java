package stirling.software.SPDF;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Path;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import io.github.pixee.security.SystemCommand;
import lombok.extern.slf4j.Slf4j;
import stirling.software.common.service.TempFileCleanupService;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.TempFileManager;

@Slf4j
@Component
public class UnoconvServer {

    private static final long ACTIVITY_TIMEOUT = 20L * 60 * 1000; // 20 minutes

    private static UnoconvServer INSTANCE;
    private static final int LISTENER_PORT = 2002;
    private ExecutorService executorService;
    private long lastActivityTime;
    private Process process;
    private Path tempDir;
    
    private final TempFileManager tempFileManager;
    private final TempFileCleanupService cleanupService;

    @Autowired
    public UnoconvServer(TempFileManager tempFileManager, TempFileCleanupService cleanupService) {
        this.tempFileManager = tempFileManager;
        this.cleanupService = cleanupService;
        INSTANCE = this;
    }

    public static UnoconvServer getInstance() {
        // If INSTANCE is not set through Spring, try to get it from the ApplicationContext
        if (INSTANCE == null) {
            INSTANCE = ApplicationContextProvider.getBean(UnoconvServer.class);
            
            if (INSTANCE == null) {
                log.warn("Creating UnoconvServer without Spring context");
                INSTANCE = new UnoconvServer(null, null);
            }
        }
        return INSTANCE;
    }

    private boolean isServerRunning() {
        log.info("Checking if unoconv server is running");
        try (Socket socket = new Socket()) {
            socket.connect(
                    new InetSocketAddress("localhost", LISTENER_PORT),
                    1000); // Timeout after 1 second
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public void start() throws IOException {
        // Check if the server is already running
        if (process != null && process.isAlive()) {
            return;
        }

        // Create and register a temp directory for unoconv if TempFileManager is available
        if (tempFileManager != null) {
            tempDir = tempFileManager.registerLibreOfficeTempDir();
            log.info("Created unoconv temp directory: {}", tempDir);
        }
        
        String command;
        if (tempDir != null) {
            command = "unoconv-server --user-profile " + tempDir.toString();
        } else {
            command = "unoconv-server";
        }
        
        // Start the server process
        process = SystemCommand.runCommand(Runtime.getRuntime(), command);
        lastActivityTime = System.currentTimeMillis();

        // Start a background thread to monitor the activity timeout
        executorService = Executors.newSingleThreadExecutor();
        executorService.submit(
                () -> {
                    while (true) {
                        long idleTime = System.currentTimeMillis() - lastActivityTime;
                        if (idleTime >= ACTIVITY_TIMEOUT) {
                            process.destroy();
                            
                            if (cleanupService != null) {
                                cleanupService.cleanupLibreOfficeTempFiles();
                            }
                            break;
                        }
                        try {
                            Thread.sleep(5000); // Check for inactivity every 5 seconds
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                            break;
                        }
                    }
                });

        // Wait for the server to start up
        long startTime = System.currentTimeMillis();
        long timeout = 30000; // Timeout after 30 seconds
        while (System.currentTimeMillis() - startTime < timeout) {
            if (isServerRunning()) {
                lastActivityTime = System.currentTimeMillis();
                return;
            }
            try {
                Thread.sleep(1000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.error("Error waiting for server to start", e);
            } // Check every 1 second
        }
    }

    public synchronized void stop() {
        // Stop the activity timeout monitor thread
        if (executorService != null) {
            executorService.shutdownNow();
        }

        // Stop the server process
        if (process != null && process.isAlive()) {
            process.destroy();
        }
        
        if (cleanupService != null) {
            cleanupService.cleanupLibreOfficeTempFiles();
        }
    }
    
    /**
     * Notify that unoconv is being used, to reset the inactivity timer.
     */
    public void notifyActivity() {
        lastActivityTime = System.currentTimeMillis();
    }
}