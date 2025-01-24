package stirling.software.SPDF.UI.impl;

import java.awt.*;
import java.io.InputStream;

import javax.imageio.ImageIO;
import javax.swing.*;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class LoadingWindow extends JDialog {
    private final JProgressBar progressBar;
    private final JLabel statusLabel;
    private final JPanel mainPanel;
    private final JLabel brandLabel;
    private long startTime;

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
                        Image scaledImg = img.getScaledInstance(48, 48, Image.SCALE_SMOOTH);
                        JLabel iconLabel = new JLabel(new ImageIcon(scaledImg));
                        iconLabel.setHorizontalAlignment(SwingConstants.CENTER);
                        gbc.gridy = 0;
                        mainPanel.add(iconLabel, gbc);
                        log.debug("Icon loaded and scaled successfully");
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
        setSize(400, 200);
        setLocationRelativeTo(parent);
        setAlwaysOnTop(true);
        setProgress(0);
        setStatus("Starting...");

        log.info(
                "LoadingWindow initialization completed in {}ms",
                System.currentTimeMillis() - startTime);
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
                            log.debug(
                                    "Current thread state - Name: {}, State: {}, Priority: {}",
                                    currentThread.getName(),
                                    currentThread.getState(),
                                    currentThread.getPriority());
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
                        log.debug(
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
