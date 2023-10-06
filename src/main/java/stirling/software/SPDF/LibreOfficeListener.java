package stirling.software.SPDF;

import io.github.pixee.security.SystemCommand;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LibreOfficeListener {

    private static final long ACTIVITY_TIMEOUT = 20 * 60 * 1000; // 20 minutes

    private static final LibreOfficeListener INSTANCE = new LibreOfficeListener();
    private static final int LISTENER_PORT = 2002;

    public static LibreOfficeListener getInstance() {
        return INSTANCE;
    }

    private ExecutorService executorService;
    private long lastActivityTime;

    private Process process;

    private LibreOfficeListener() {
    }

    private boolean isListenerRunning() {
        try {
            System.out.println("waiting for listener to start");
            Socket socket = new Socket();
            socket.connect(new InetSocketAddress("localhost", 2002), 1000); // Timeout after 1 second
            socket.close();
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    public void start() throws IOException {
        // Check if the listener is already running
        if (process != null && process.isAlive()) {
            return;
        }

        // Start the listener process
        process = SystemCommand.runCommand(Runtime.getRuntime(), "unoconv --listener");
        lastActivityTime = System.currentTimeMillis();

        // Start a background thread to monitor the activity timeout
        executorService = Executors.newSingleThreadExecutor();
        executorService.submit(() -> {
            while (true) {
                long idleTime = System.currentTimeMillis() - lastActivityTime;
                if (idleTime >= ACTIVITY_TIMEOUT) {
                    // If there has been no activity for too long, tear down the listener
                    process.destroy();
                    break;
                }
                try {
                    Thread.sleep(5000); // Check for inactivity every 5 seconds
                } catch (InterruptedException e) {
                    break;
                }
            }
        });

        // Wait for the listener to start up
        long startTime = System.currentTimeMillis();
        long timeout = 30000; // Timeout after 30 seconds
        while (System.currentTimeMillis() - startTime < timeout) {
            if (isListenerRunning()) {

                lastActivityTime = System.currentTimeMillis();
                return;
            }
            try {
                Thread.sleep(1000);
            } catch (InterruptedException e) {
                // TODO Auto-generated catch block
                e.printStackTrace();
            } // Check every 1 second
        }
    }

    public synchronized void stop() {
        // Stop the activity timeout monitor thread
        executorService.shutdownNow();

        // Stop the listener process
        if (process != null && process.isAlive()) {
            process.destroy();
        }
    }

}
