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

                                    // Show the frame immediately but transparent
                                    frame.setVisible(true);
                                });
                    } catch (Exception e) {
                        log.error("Error initializing JCEF browser: ", e);
                        cleanup();
                    }
                });
    }

    private void configureCefSettings(CefAppBuilder builder) {
        CefSettings settings = builder.getCefSettings();
        settings.cache_path = new File("jcef-bundle").getAbsolutePath();
        settings.root_cache_path = new File("jcef-bundle").getAbsolutePath();
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

        frame.setSize(1280, 768);
        frame.setLocationRelativeTo(null);

        loadIcon();
    }

    private void setupLoadHandler() {
        client.addLoadHandler(
                new CefLoadHandlerAdapter() {
                    @Override
                    public void onLoadingStateChange(
                            CefBrowser browser,
                            boolean isLoading,
                            boolean canGoBack,
                            boolean canGoForward) {
                        if (!isLoading && !browserInitialized) {
                            browserInitialized = true;
                            SwingUtilities.invokeLater(
                                    () -> {
                                        if (loadingWindow != null) {
                                            Timer timer =
                                                    new Timer(
                                                            500,
                                                            e -> {
                                                                loadingWindow.dispose();
                                                                loadingWindow = null;

                                                                frame.dispose();
                                                                frame.setOpacity(1.0f);
                                                                frame.setUndecorated(false);
                                                                frame.pack();
                                                                frame.setSize(1280, 800);
                                                                frame.setLocationRelativeTo(null);
                                                                frame.setVisible(true);
                                                                frame.requestFocus();
                                                                frame.toFront();
                                                                browser.getUIComponent()
                                                                        .requestFocus();
                                                            });
                                            timer.setRepeats(false);
                                            timer.start();
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
}
