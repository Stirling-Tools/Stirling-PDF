package stirling.software.SPDF;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;

import io.github.pixee.security.SystemCommand;

public class LibreOfficeListener {

    private static final long ACTIVITY_TIMEOUT = 20 * 60 * 1000; // 20 minutes

    private static final LibreOfficeListener INSTANCE = new LibreOfficeListener();
    private static final int LISTENER_PORT = 2002;

    private long lastActivityTime;
    private ListenerProcess listenerProcess;

    public static LibreOfficeListener getInstance() {
        return INSTANCE;
    }

    public void start() throws IOException {
        if (listenerProcess != null && listenerProcess.isRunning()) {
            return;
        }

        listenerProcess = new StartListenerProcess();
        listenerProcess.start();
        lastActivityTime = System.currentTimeMillis();

        ActivityMonitor monitor = new ActivityMonitor();
        monitor.start();
    }

    public synchronized void stop() {
        if (listenerProcess != null && listenerProcess.isRunning()) {
            listenerProcess.stop();
        }
    }

    private class ActivityMonitor extends Thread {
        @Override
        public void run() {
            while (true) {
                long idleTime = System.currentTimeMillis() - lastActivityTime;
                if (idleTime >= ACTIVITY_TIMEOUT) {
                    listenerProcess.stop();
                    break;
                }
                try {
                    Thread.sleep(5000); // Check for inactivity every 5 seconds
                } catch (InterruptedException e) {
                    break;
                }
            }
        }
    }

    interface ListenerProcess {
        void start() throws IOException;

        void stop();

        boolean isRunning();
    }

    private class StartListenerProcess implements ListenerProcess {
        private Process process;

        @Override
        public void start() throws IOException {
            process = SystemCommand.runCommand(Runtime.getRuntime(), "unoconv --listener");
        }

        @Override
        public void stop() {
            if (process != null && process.isAlive()) {
                process.destroy();
            }
        }

        @Override
        public boolean isRunning() {
            return isListenerRunning();
        }
    }

    private boolean isListenerRunning() {
        try {
            System.out.println("waiting for listener to start");
            Socket socket = new Socket();
            socket.connect(
                    new InetSocketAddress("localhost", LISTENER_PORT),
                    1000); // Timeout after 1 second
            socket.close();
            return true;
        } catch (IOException e) {
            return false;
        }
    }
}
