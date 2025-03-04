package stirling.software.SPDF.UI.impl;

import java.awt.AWTException;
import java.awt.BorderLayout;
import java.awt.Frame;
import java.awt.Image;
import java.awt.MenuItem;
import java.awt.PopupMenu;
import java.awt.SystemTray;
import java.awt.TrayIcon;
import java.awt.event.WindowEvent;
import java.awt.event.WindowStateListener;
import java.io.File;
import java.io.InputStream;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;

import javax.imageio.ImageIO;
import javax.swing.JFrame;
import javax.swing.JPanel;
import javax.swing.SwingUtilities;
import javax.swing.Timer;

import org.cef.CefApp;
import org.cef.CefClient;
import org.cef.CefSettings;
import org.cef.browser.CefBrowser;
import org.cef.callback.CefBeforeDownloadCallback;
import org.cef.callback.CefDownloadItem;
import org.cef.callback.CefDownloadItemCallback;
import org.cef.handler.CefDownloadHandlerAdapter;
import org.cef.handler.CefLoadHandlerAdapter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;

import lombok.extern.slf4j.Slf4j;

import me.friwi.jcefmaven.CefAppBuilder;
import me.friwi.jcefmaven.EnumProgress;
import me.friwi.jcefmaven.MavenCefAppHandlerAdapter;
import me.friwi.jcefmaven.impl.progress.ConsoleProgressHandler;

import stirling.software.SPDF.UI.WebBrowser;
import stirling.software.SPDF.config.InstallationPathConfig;
import stirling.software.SPDF.utils.UIScaling;

@Component
@Slf4j
@ConditionalOnProperty(
        name = "STIRLING_PDF_DESKTOP_UI",
        havingValue = "true",
        matchIfMissing = false)
public class DesktopBrowser implements WebBrowser {
    private static CefApp cefApp;
    private static CefClient client;
    private static CefBrowser browser;
    private static JFrame frame;
    private static LoadingWindow loadingWindow;
    private static volatile boolean browserInitialized = false;
    private static TrayIcon trayIcon;
    private static SystemTray systemTray;

    public DesktopBrowser() {
        SwingUtilities.invokeLater(
                () -> {
                    loadingWindow = new LoadingWindow(null, "Initializing...");
                    loadingWindow.setVisible(true);
                });
    }

    public void initWebUI(String url) {
        CompletableFuture.runAsync(
                () -> {
                    try {
                        CefAppBuilder builder = new CefAppBuilder();
                        configureCefSettings(builder);
                        builder.setProgressHandler(createProgressHandler());
                        builder.setInstallDir(
                                new File(InstallationPathConfig.getClientWebUIPath()));
                        // Build and initialize CEF
                        cefApp = builder.build();
                        client = cefApp.createClient();

                        // Set up download handler
                        setupDownloadHandler();

                        // Create browser and frame on EDT
                        SwingUtilities.invokeAndWait(
                                () -> {
                                    browser = client.createBrowser(url, false, false);
                                    setupMainFrame();
                                    setupLoadHandler();

                                    // Force initialize UI after 7 seconds if not already done
                                    Timer timeoutTimer =
                                            new Timer(
                                                    2500,
                                                    e -> {
                                                        log.warn(
                                                                "Loading timeout reached. Forcing"
                                                                        + " UI transition.");
                                                        if (!browserInitialized) {
                                                            // Force UI initialization
                                                            forceInitializeUI();
                                                        }
                                                    });
                                    timeoutTimer.setRepeats(false);
                                    timeoutTimer.start();
                                });
                    } catch (Exception e) {
                        log.error("Error initializing JCEF browser: ", e);
                        cleanup();
                    }
                });
    }

    private void configureCefSettings(CefAppBuilder builder) {
        CefSettings settings = builder.getCefSettings();
        String basePath = InstallationPathConfig.getClientWebUIPath();
        log.info("basePath " + basePath);
        settings.cache_path = new File(basePath + "cache").getAbsolutePath();
        settings.root_cache_path = new File(basePath + "root_cache").getAbsolutePath();
        //        settings.browser_subprocess_path = new File(basePath +
        // "subprocess").getAbsolutePath();
        //        settings.resources_dir_path = new File(basePath + "resources").getAbsolutePath();
        //        settings.locales_dir_path = new File(basePath + "locales").getAbsolutePath();
        settings.log_file = new File(basePath, "debug.log").getAbsolutePath();

        settings.persist_session_cookies = true;
        settings.windowless_rendering_enabled = false;
        settings.log_severity = CefSettings.LogSeverity.LOGSEVERITY_INFO;

        builder.setAppHandler(
                new MavenCefAppHandlerAdapter() {
                    @Override
                    public void stateHasChanged(org.cef.CefApp.CefAppState state) {
                        log.info("CEF state changed: " + state);
                        if (state == CefApp.CefAppState.TERMINATED) {
                            System.exit(0);
                        }
                    }
                });
    }

    private void setupDownloadHandler() {
        client.addDownloadHandler(
                new CefDownloadHandlerAdapter() {
                    @Override
                    public boolean onBeforeDownload(
                            CefBrowser browser,
                            CefDownloadItem downloadItem,
                            String suggestedName,
                            CefBeforeDownloadCallback callback) {
                        callback.Continue("", true);
                        return true;
                    }

                    @Override
                    public void onDownloadUpdated(
                            CefBrowser browser,
                            CefDownloadItem downloadItem,
                            CefDownloadItemCallback callback) {
                        if (downloadItem.isComplete()) {
                            log.info("Download completed: " + downloadItem.getFullPath());
                        } else if (downloadItem.isCanceled()) {
                            log.info("Download canceled: " + downloadItem.getFullPath());
                        }
                    }
                });
    }

    private ConsoleProgressHandler createProgressHandler() {
        return new ConsoleProgressHandler() {
            @Override
            public void handleProgress(EnumProgress state, float percent) {
                Objects.requireNonNull(state, "state cannot be null");
                SwingUtilities.invokeLater(
                        () -> {
                            if (loadingWindow != null) {
                                switch (state) {
                                    case LOCATING:
                                        loadingWindow.setStatus("Locating Files...");
                                        loadingWindow.setProgress(0);
                                        break;
                                    case DOWNLOADING:
                                        if (percent >= 0) {
                                            loadingWindow.setStatus(
                                                    String.format(
                                                            "Downloading additional files: %.0f%%",
                                                            percent));
                                            loadingWindow.setProgress((int) percent);
                                        }
                                        break;
                                    case EXTRACTING:
                                        loadingWindow.setStatus("Extracting files...");
                                        loadingWindow.setProgress(60);
                                        break;
                                    case INITIALIZING:
                                        loadingWindow.setStatus("Initializing UI...");
                                        loadingWindow.setProgress(80);
                                        break;
                                    case INITIALIZED:
                                        loadingWindow.setStatus("Finalising startup...");
                                        loadingWindow.setProgress(90);
                                        break;
                                }
                            }
                        });
            }
        };
    }

    private void setupMainFrame() {
        frame = new JFrame("Stirling-PDF");
        frame.setDefaultCloseOperation(JFrame.DO_NOTHING_ON_CLOSE);
        frame.setUndecorated(true);
        frame.setOpacity(0.0f);

        JPanel contentPane = new JPanel(new BorderLayout());
        contentPane.setDoubleBuffered(true);
        contentPane.add(browser.getUIComponent(), BorderLayout.CENTER);
        frame.setContentPane(contentPane);

        frame.addWindowListener(
                new java.awt.event.WindowAdapter() {
                    @Override
                    public void windowClosing(java.awt.event.WindowEvent windowEvent) {
                        cleanup();
                        System.exit(0);
                    }
                });

        frame.setSize(UIScaling.scaleWidth(1280), UIScaling.scaleHeight(800));
        frame.setLocationRelativeTo(null);

        loadIcon();
    }

    private void setupLoadHandler() {
        final long initStartTime = System.currentTimeMillis();
        log.info("Setting up load handler at: {}", initStartTime);

        client.addLoadHandler(
                new CefLoadHandlerAdapter() {
                    @Override
                    public void onLoadingStateChange(
                            CefBrowser browser,
                            boolean isLoading,
                            boolean canGoBack,
                            boolean canGoForward) {
                        log.debug(
                                "Loading state change - isLoading: {}, canGoBack: {}, canGoForward:"
                                        + " {}, browserInitialized: {}, Time elapsed: {}ms",
                                isLoading,
                                canGoBack,
                                canGoForward,
                                browserInitialized,
                                System.currentTimeMillis() - initStartTime);

                        if (!isLoading && !browserInitialized) {
                            log.info(
                                    "Browser finished loading, preparing to initialize UI"
                                            + " components");
                            browserInitialized = true;
                            SwingUtilities.invokeLater(
                                    () -> {
                                        try {
                                            if (loadingWindow != null) {
                                                log.info("Starting UI initialization sequence");

                                                // Close loading window first
                                                loadingWindow.setVisible(false);
                                                loadingWindow.dispose();
                                                loadingWindow = null;
                                                log.info("Loading window disposed");

                                                // Then setup the main frame
                                                frame.setVisible(false);
                                                frame.dispose();
                                                frame.setOpacity(1.0f);
                                                frame.setUndecorated(false);
                                                frame.pack();
                                                frame.setSize(
                                                        UIScaling.scaleWidth(1280),
                                                        UIScaling.scaleHeight(800));
                                                frame.setLocationRelativeTo(null);
                                                log.debug("Frame reconfigured");

                                                // Show the main frame
                                                frame.setVisible(true);
                                                frame.requestFocus();
                                                frame.toFront();
                                                log.info("Main frame displayed and focused");

                                                // Focus the browser component
                                                Timer focusTimer =
                                                        new Timer(
                                                                100,
                                                                e -> {
                                                                    try {
                                                                        browser.getUIComponent()
                                                                                .requestFocus();
                                                                        log.info(
                                                                                "Browser component"
                                                                                        + " focused");
                                                                    } catch (Exception ex) {
                                                                        log.error(
                                                                                "Error focusing"
                                                                                        + " browser",
                                                                                ex);
                                                                    }
                                                                });
                                                focusTimer.setRepeats(false);
                                                focusTimer.start();
                                            }
                                        } catch (Exception e) {
                                            log.error("Error during UI initialization", e);
                                            // Attempt cleanup on error
                                            if (loadingWindow != null) {
                                                loadingWindow.dispose();
                                                loadingWindow = null;
                                            }
                                            if (frame != null) {
                                                frame.setVisible(true);
                                                frame.requestFocus();
                                            }
                                        }
                                    });
                        }
                    }
                });
    }

    private void setupTrayIcon(Image icon) {
        if (!SystemTray.isSupported()) {
            log.warn("System tray is not supported");
            return;
        }

        try {
            systemTray = SystemTray.getSystemTray();

            // Create popup menu
            PopupMenu popup = new PopupMenu();

            // Create menu items
            MenuItem showItem = new MenuItem("Show");
            showItem.addActionListener(
                    e -> {
                        frame.setVisible(true);
                        frame.setState(Frame.NORMAL);
                    });

            MenuItem exitItem = new MenuItem("Exit");
            exitItem.addActionListener(
                    e -> {
                        cleanup();
                        System.exit(0);
                    });

            // Add menu items to popup menu
            popup.add(showItem);
            popup.addSeparator();
            popup.add(exitItem);

            // Create tray icon
            trayIcon = new TrayIcon(icon, "Stirling-PDF", popup);
            trayIcon.setImageAutoSize(true);

            // Add double-click behavior
            trayIcon.addActionListener(
                    e -> {
                        frame.setVisible(true);
                        frame.setState(Frame.NORMAL);
                    });

            // Add tray icon to system tray
            systemTray.add(trayIcon);

            // Modify frame behavior to minimize to tray
            frame.addWindowStateListener(
                    new WindowStateListener() {
                        public void windowStateChanged(WindowEvent e) {
                            if (e.getNewState() == Frame.ICONIFIED) {
                                frame.setVisible(false);
                            }
                        }
                    });

        } catch (AWTException e) {
            log.error("Error setting up system tray icon", e);
        }
    }

    private void loadIcon() {
        try {
            Image icon = null;
            String[] iconPaths = {"/static/favicon.ico"};

            for (String path : iconPaths) {
                if (icon != null) break;
                try {
                    try (InputStream is = getClass().getResourceAsStream(path)) {
                        if (is != null) {
                            icon = ImageIO.read(is);
                            break;
                        }
                    }
                } catch (Exception e) {
                    log.debug("Could not load icon from " + path, e);
                }
            }

            if (icon != null) {
                frame.setIconImage(icon);
                setupTrayIcon(icon);
            } else {
                log.warn("Could not load icon from any source");
            }
        } catch (Exception e) {
            log.error("Error loading icon", e);
        }
    }

    @PreDestroy
    public void cleanup() {
        if (browser != null) browser.close(true);
        if (client != null) client.dispose();
        if (cefApp != null) cefApp.dispose();
        if (loadingWindow != null) loadingWindow.dispose();
    }

    public static void forceInitializeUI() {
        try {
            if (loadingWindow != null) {
                log.info("Forcing start of UI initialization sequence");

                // Close loading window first
                loadingWindow.setVisible(false);
                loadingWindow.dispose();
                loadingWindow = null;
                log.info("Loading window disposed");

                // Then setup the main frame
                frame.setVisible(false);
                frame.dispose();
                frame.setOpacity(1.0f);
                frame.setUndecorated(false);
                frame.pack();
                frame.setSize(UIScaling.scaleWidth(1280), UIScaling.scaleHeight(800));
                frame.setLocationRelativeTo(null);
                log.debug("Frame reconfigured");

                // Show the main frame
                frame.setVisible(true);
                frame.requestFocus();
                frame.toFront();
                log.info("Main frame displayed and focused");

                // Focus the browser component if available
                if (browser != null) {
                    Timer focusTimer =
                            new Timer(
                                    100,
                                    e -> {
                                        try {
                                            browser.getUIComponent().requestFocus();
                                            log.info("Browser component focused");
                                        } catch (Exception ex) {
                                            log.error(
                                                    "Error focusing browser during force ui"
                                                            + " initialization.",
                                                    ex);
                                        }
                                    });
                    focusTimer.setRepeats(false);
                    focusTimer.start();
                }
            }
        } catch (Exception e) {
            log.error("Error during Forced UI initialization.", e);
            // Attempt cleanup on error
            if (loadingWindow != null) {
                loadingWindow.dispose();
                loadingWindow = null;
            }
            if (frame != null) {
                frame.setVisible(true);
                frame.setOpacity(1.0f);
                frame.setUndecorated(false);
                frame.requestFocus();
            }
        }
    }
}
