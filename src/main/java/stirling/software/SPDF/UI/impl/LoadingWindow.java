package stirling.software.SPDF.UI.impl;

import java.awt.*;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import javax.imageio.ImageIO;
import javax.swing.*;

import io.github.pixee.security.BoundedLineReader;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.utils.UIScaling;

@Slf4j
public class LoadingWindow extends JDialog {
    private final JProgressBar progressBar;
    private final JLabel statusLabel;
    private final JPanel mainPanel;
    private final JLabel brandLabel;
    private long startTime;

    private Timer stuckTimer;
    private long stuckThreshold = 4000;
    private long timeAt90Percent = -1;
    private volatile Process explorerProcess;
    private static final boolean IS_WINDOWS =
            System.getProperty("os.name").toLowerCase().contains("win");

    public LoadingWindow(Frame parent, String initialUrl) {
        super(parent, "Initializing Stirling-PDF", true);
        startTime = System.currentTimeMillis();
        log.info("Creating LoadingWindow - initialization started at: {}", startTime);

        // Initialize components
        mainPanel = new JPanel();
        mainPanel.setBackground(Color.WHITE);
        mainPanel.setBorder(BorderFactory.createEmptyBorder(20, 30, 20, 30));
        mainPanel.setLayout(new GridBagLayout());
        GridBagConstraints gbc = new GridBagConstraints();

        // Configure GridBagConstraints
        gbc.gridwidth = GridBagConstraints.REMAINDER;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.weightx = 1.0;
        gbc.weighty = 0.0;

        // Add icon
        try {
            try (InputStream is = getClass().getResourceAsStream("/static/favicon.ico")) {
                if (is != null) {
                    Image img = ImageIO.read(is);
                    if (img != null) {
                        Image scaledImg = UIScaling.scaleIcon(img, 48, 48);
                        JLabel iconLabel = new JLabel(new ImageIcon(scaledImg));
                        iconLabel.setHorizontalAlignment(SwingConstants.CENTER);
                        gbc.gridy = 0;
                        mainPanel.add(iconLabel, gbc);
                        log.info("Icon loaded and scaled successfully");
                    }
                }
            }
        } catch (Exception e) {
            log.error("Failed to load icon", e);
        }

        // URL Label with explicit size
        brandLabel = new JLabel(initialUrl);
        brandLabel.setHorizontalAlignment(SwingConstants.CENTER);
        brandLabel.setPreferredSize(new Dimension(300, 25));
        brandLabel.setText("Stirling-PDF");
        gbc.gridy = 1;
        mainPanel.add(brandLabel, gbc);

        // Status label with explicit size
        statusLabel = new JLabel("Initializing...");
        statusLabel.setHorizontalAlignment(SwingConstants.CENTER);
        statusLabel.setPreferredSize(new Dimension(300, 25));
        gbc.gridy = 2;
        mainPanel.add(statusLabel, gbc);

        // Progress bar with explicit size
        progressBar = new JProgressBar(0, 100);
        progressBar.setStringPainted(true);
        progressBar.setPreferredSize(new Dimension(300, 25));
        gbc.gridy = 3;
        mainPanel.add(progressBar, gbc);

        // Set dialog properties
        setContentPane(mainPanel);
        setDefaultCloseOperation(JDialog.DO_NOTHING_ON_CLOSE);
        setResizable(false);
        setUndecorated(false);

        // Set size and position
        setSize(UIScaling.scaleWidth(400), UIScaling.scaleHeight(200));

        setLocationRelativeTo(parent);
        setAlwaysOnTop(true);
        setProgress(0);
        setStatus("Starting...");

        log.info(
                "LoadingWindow initialization completed in {}ms",
                System.currentTimeMillis() - startTime);
    }

    private void checkAndRefreshExplorer() {
        if (!IS_WINDOWS) {
            return;
        }
        if (timeAt90Percent == -1) {
            timeAt90Percent = System.currentTimeMillis();
            stuckTimer =
                    new Timer(
                            1000,
                            e -> {
                                long currentTime = System.currentTimeMillis();
                                if (currentTime - timeAt90Percent > stuckThreshold) {
                                    try {
                                        log.debug(
                                                "Attempting Windows explorer refresh due to 90% stuck state");
                                        String currentDir = System.getProperty("user.dir");

                                        // Store current explorer PIDs before we start new one
                                        Set<String> existingPids = new HashSet<>();
                                        ProcessBuilder listExplorer =
                                                new ProcessBuilder(
                                                        "cmd",
                                                        "/c",
                                                        "wmic",
                                                        "process",
                                                        "where",
                                                        "name='explorer.exe'",
                                                        "get",
                                                        "ProcessId",
                                                        "/format:csv");
                                        Process process = listExplorer.start();
                                        BufferedReader reader =
                                                new BufferedReader(
                                                        new InputStreamReader(
                                                                process.getInputStream()));
                                        String line;
                                        while ((line =
                                                        BoundedLineReader.readLine(
                                                                reader, 5_000_000))
                                                != null) {
                                            if (line.matches(".*\\d+.*")) { // Contains numbers
                                                String[] parts = line.trim().split(",");
                                                if (parts.length >= 2) {
                                                    existingPids.add(
                                                            parts[parts.length - 1].trim());
                                                }
                                            }
                                        }
                                        process.waitFor(2, TimeUnit.SECONDS);

                                        // Start new explorer
                                        ProcessBuilder pb =
                                                new ProcessBuilder(
                                                        "cmd",
                                                        "/c",
                                                        "start",
                                                        "/min",
                                                        "/b",
                                                        "explorer.exe",
                                                        currentDir);
                                        pb.redirectErrorStream(true);
                                        explorerProcess = pb.start();

                                        // Schedule cleanup
                                        Timer cleanupTimer =
                                                new Timer(
                                                        2000,
                                                        cleanup -> {
                                                            try {
                                                                // Find new explorer processes
                                                                ProcessBuilder findNewExplorer =
                                                                        new ProcessBuilder(
                                                                                "cmd",
                                                                                "/c",
                                                                                "wmic",
                                                                                "process",
                                                                                "where",
                                                                                "name='explorer.exe'",
                                                                                "get",
                                                                                "ProcessId",
                                                                                "/format:csv");
                                                                Process newProcess =
                                                                        findNewExplorer.start();
                                                                BufferedReader newReader =
                                                                        new BufferedReader(
                                                                                new InputStreamReader(
                                                                                        newProcess
                                                                                                .getInputStream()));
                                                                String newLine;
                                                                while ((newLine =
                                                                                BoundedLineReader
                                                                                        .readLine(
                                                                                                newReader,
                                                                                                5_000_000))
                                                                        != null) {
                                                                    if (newLine.matches(
                                                                            ".*\\d+.*")) {
                                                                        String[] parts =
                                                                                newLine.trim()
                                                                                        .split(",");
                                                                        if (parts.length >= 2) {
                                                                            String pid =
                                                                                    parts[
                                                                                            parts.length
                                                                                                    - 1]
                                                                                            .trim();
                                                                            if (!existingPids
                                                                                    .contains(
                                                                                            pid)) {
                                                                                log.debug(
                                                                                        "Found new explorer.exe with PID: "
                                                                                                + pid);
                                                                                ProcessBuilder
                                                                                        killProcess =
                                                                                                new ProcessBuilder(
                                                                                                        "taskkill",
                                                                                                        "/PID",
                                                                                                        pid,
                                                                                                        "/F");
                                                                                killProcess
                                                                                        .redirectErrorStream(
                                                                                                true);
                                                                                Process killResult =
                                                                                        killProcess
                                                                                                .start();
                                                                                killResult.waitFor(
                                                                                        2,
                                                                                        TimeUnit
                                                                                                .SECONDS);
                                                                                log.debug(
                                                                                        "Explorer process terminated: "
                                                                                                + pid);
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                                newProcess.waitFor(
                                                                        2, TimeUnit.SECONDS);
                                                            } catch (Exception ex) {
                                                                log.error(
                                                                        "Error cleaning up Windows explorer process",
                                                                        ex);
                                                            }
                                                        });
                                        cleanupTimer.setRepeats(false);
                                        cleanupTimer.start();
                                        stuckTimer.stop();
                                    } catch (Exception ex) {
                                        log.error("Error refreshing Windows explorer", ex);
                                    }
                                }
                            });
            stuckTimer.setRepeats(true);
            stuckTimer.start();
        }
    }

    public void setProgress(final int progress) {
        SwingUtilities.invokeLater(
                () -> {
                    try {
                        int validProgress = Math.min(Math.max(progress, 0), 100);
                        log.info(
                                "Setting progress to {}% at {}ms since start",
                                validProgress, System.currentTimeMillis() - startTime);

                        // Log additional details when near 90%
                        if (validProgress >= 85 && validProgress <= 95) {
                            log.info(
                                    "Near 90% progress - Current status: {}, Window visible: {}, "
                                            + "Progress bar responding: {}, Memory usage: {}MB",
                                    statusLabel.getText(),
                                    isVisible(),
                                    progressBar.isEnabled(),
                                    Runtime.getRuntime().totalMemory() / (1024 * 1024));

                            // Add thread state logging
                            Thread currentThread = Thread.currentThread();
                            log.info(
                                    "Current thread state - Name: {}, State: {}, Priority: {}",
                                    currentThread.getName(),
                                    currentThread.getState(),
                                    currentThread.getPriority());

                            if (validProgress >= 90 && validProgress < 95) {
                                checkAndRefreshExplorer();
                            } else {
                                // Reset the timer if we move past 95%
                                if (validProgress >= 95) {
                                    if (stuckTimer != null) {
                                        stuckTimer.stop();
                                    }
                                    timeAt90Percent = -1;
                                }
                            }
                        }

                        progressBar.setValue(validProgress);
                        progressBar.setString(validProgress + "%");
                        mainPanel.revalidate();
                        mainPanel.repaint();
                    } catch (Exception e) {
                        log.error("Error updating progress to " + progress, e);
                    }
                });
    }

    public void setStatus(final String status) {
        log.info(
                "Status update at {}ms - Setting status to: {}",
                System.currentTimeMillis() - startTime,
                status);

        SwingUtilities.invokeLater(
                () -> {
                    try {
                        String validStatus = status != null ? status : "";
                        statusLabel.setText(validStatus);

                        // Log UI state when status changes
                        log.info(
                                "UI State - Window visible: {}, Progress: {}%, Status: {}",
                                isVisible(), progressBar.getValue(), validStatus);

                        mainPanel.revalidate();
                        mainPanel.repaint();
                    } catch (Exception e) {
                        log.error("Error updating status to: " + status, e);
                    }
                });
    }

    @Override
    public void dispose() {
        log.info("LoadingWindow disposing after {}ms", System.currentTimeMillis() - startTime);
        super.dispose();
    }
}
