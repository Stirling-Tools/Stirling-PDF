package stirling.software.SPDF.service;

import java.awt.Font;
import java.awt.GraphicsEnvironment;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Service for managing and listing available fonts from the system. Supports both built-in standard
 * fonts and system-installed fonts from /usr/share/fonts.
 */
@Service
@Slf4j
public class FontService {

    // Standard PDF fonts that are always available
    private static final List<String> STANDARD_FONTS =
            Arrays.asList("Helvetica", "Times-Roman", "Courier", "Arial", "Georgia");

    // Font file extensions to look for
    private static final Set<String> FONT_EXTENSIONS = Set.of(".ttf", ".otf", ".ttc");

    // System font directories to search
    private static final List<String> SYSTEM_FONT_PATHS =
            Arrays.asList(
                    "/usr/share/fonts",
                    "/usr/local/share/fonts",
                    "/usr/X11R6/lib/X11/fonts",
                    "C:\\Windows\\Fonts", // Windows
                    "/System/Library/Fonts", // macOS
                    "/Library/Fonts" // macOS
                    );

    // Cache fonts to avoid repeated file system scans
    private List<String> cachedFonts;
    private long lastCacheBuildTime = 0;
    private static final long CACHE_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes

    /** Get all available fonts: standard PDF fonts + system fonts */
    public List<String> getAvailableFonts() {
        // Return cached fonts if still valid
        if (cachedFonts != null
                && System.currentTimeMillis() - lastCacheBuildTime < CACHE_VALIDITY_MS) {
            return new ArrayList<>(cachedFonts);
        }

        Set<String> allFonts = new LinkedHashSet<>();

        // Add standard PDF fonts first (guaranteed to be available)
        allFonts.addAll(STANDARD_FONTS);

        // Add system fonts
        allFonts.addAll(getSystemFonts());

        // Convert to sorted list and cache
        cachedFonts = allFonts.stream().distinct().sorted().collect(Collectors.toList());
        lastCacheBuildTime = System.currentTimeMillis();

        return new ArrayList<>(cachedFonts);
    }

    /** Get system-installed fonts from standard system directories */
    private List<String> getSystemFonts() {
        Set<String> systemFonts = new LinkedHashSet<>();

        // Try to get AWT system fonts
        int awtFontCount = 0;
        try {
            Font[] fonts = GraphicsEnvironment.getLocalGraphicsEnvironment().getAllFonts();
            awtFontCount = fonts.length;
            log.info("🔍 Found {} fonts from GraphicsEnvironment.getAllFonts()", fonts.length);
            for (Font font : fonts) {
                String fontName = font.getFontName();
                if (!fontName.isEmpty()) {
                    systemFonts.add(fontName);
                }
            }
            log.info("✅ Added {} unique fonts from AWT", systemFonts.size());
        } catch (Exception e) {
            log.warn("⚠️ Error getting AWT fonts: {}", e.getMessage());
        }

        // Also scan standard font directories
        int directoryFontCount = 0;
        for (String fontPath : SYSTEM_FONT_PATHS) {
            try {
                List<String> dirFonts = scanFontDirectory(fontPath);
                if (!dirFonts.isEmpty()) {
                    log.info("🔍 Found {} fonts in {}", dirFonts.size(), fontPath);
                    directoryFontCount += dirFonts.size();
                    systemFonts.addAll(dirFonts);
                }
            } catch (Exception e) {
                log.debug("Could not scan font directory {}: {}", fontPath, e.getMessage());
            }
        }

        log.info("📊 Final Results:");
        log.info("   AWT Fonts: {}", awtFontCount);
        log.info("   Directory Fonts: {}", directoryFontCount);
        log.info("   Total Unique System Fonts: {}", systemFonts.size());

        if (!systemFonts.isEmpty()) {
            List<String> sortedList = new ArrayList<>(systemFonts);
            Collections.sort(sortedList);
            if (sortedList.size() > 0) {
                log.debug(
                        "   First 5 system fonts: {}",
                        sortedList.subList(0, Math.min(5, sortedList.size())));
            }
        }

        return new ArrayList<>(systemFonts);
    }

    /** Scan a directory recursively for font files and extract font names */
    private List<String> scanFontDirectory(String dirPath) {
        List<String> fonts = new ArrayList<>();

        try {
            Path startPath = Paths.get(dirPath);
            if (!Files.exists(startPath)) {
                return fonts;
            }

            try (Stream<Path> paths = Files.walk(startPath, 3)) {
                paths.filter(Files::isRegularFile)
                        .filter(
                                path -> {
                                    String fileName = path.getFileName().toString().toLowerCase();
                                    return FONT_EXTENSIONS.stream().anyMatch(fileName::endsWith);
                                })
                        .forEach(
                                path -> {
                                    try {
                                        String fontName = extractFontName(path.toFile());
                                        if (fontName != null && !fontName.isEmpty()) {
                                            fonts.add(fontName);
                                        }
                                    } catch (Exception e) {
                                        log.debug(
                                                "Could not extract font name from {}: {}",
                                                path,
                                                e.getMessage());
                                    }
                                });
            }
        } catch (IOException e) {
            log.debug("Error scanning font directory {}: {}", dirPath, e.getMessage());
        }

        return fonts;
    }

    /** Extract the font name from a font file by trying to load it with AWT */
    private String extractFontName(File fontFile) {
        try {
            // Try TrueType first
            try {
                Font font = Font.createFont(Font.TRUETYPE_FONT, fontFile);
                String fontName = font.getFontName();
                if (!fontName.isEmpty() && !fontName.equals("Dialog")) {
                    log.debug("Loaded TrueType font: {} from {}", fontName, fontFile.getName());
                    return fontName;
                }
            } catch (Exception e) {
                log.debug("Failed to load as TrueType: {}", fontFile.getName());
            }

            // Fallback: extract name from filename for OTF/other formats
            String fileName = fontFile.getName();
            if (fileName.matches(".*\\.(ttf|otf|ttc)$")) {
                // Remove extension and use filename as font name
                String fontName = fileName.replaceAll("\\.(ttf|otf|ttc)$", "").trim();
                if (!fontName.isEmpty() && !fontName.equals("Dialog")) {
                    log.debug("Using filename as font name: {} from {}", fontName, fileName);
                    return fontName;
                }
            }

            return null;
        } catch (Exception e) {
            log.debug("Could not load font from {}: {}", fontFile.getName(), e.getMessage());
            return null;
        }
    }

    /** Invalidate font cache to force a refresh */
    public void invalidateFontCache() {
        cachedFonts = null;
        lastCacheBuildTime = 0;
    }
}
