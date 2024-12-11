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

    public LoadingWindow(Frame parent, String initialUrl) {
        super(parent, "Initializing Stirling-PDF", true);

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
        gbc.weightx = 1.0; // Add horizontal weight
        gbc.weighty = 0.0; // Add vertical weight

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
    }

    public void setProgress(final int progress) {
        SwingUtilities.invokeLater(
                () -> {
                    try {
                        progressBar.setValue(Math.min(Math.max(progress, 0), 100));
                        progressBar.setString(progress + "%");
                        mainPanel.revalidate();
                        mainPanel.repaint();
                    } catch (Exception e) {
                        log.error("Error updating progress", e);
                    }
                });
    }

    public void setStatus(final String status) {
        log.info(status);
        SwingUtilities.invokeLater(
                () -> {
                    try {
                        statusLabel.setText(status != null ? status : "");
                        mainPanel.revalidate();
                        mainPanel.repaint();
                    } catch (Exception e) {
                        log.error("Error updating status", e);
                    }
                });
    }
}
