package stirling.software.SPDF.service.ocr;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

/**
 * What counts as an installed OCR language: a {@code <code>.traineddata} file in the tessdata
 * folder. {@code osd} is excluded because it is Tesseract's orientation model, not a language.
 */
public final class OcrLanguages {

    public static final String SUFFIX = ".traineddata";
    public static final String OSD = "osd";

    private OcrLanguages() {}

    /** Installed language codes, sorted; empty when the folder is missing or unreadable. */
    public static List<String> installed(String tessdataDir) {
        File[] files = tessdataDir == null ? null : new File(tessdataDir).listFiles();
        if (files == null) return List.of();
        return Arrays.stream(files)
                .filter(File::isFile)
                .map(File::getName)
                .filter(name -> name.toLowerCase(Locale.ROOT).endsWith(SUFFIX))
                .map(name -> name.substring(0, name.length() - SUFFIX.length()))
                .filter(code -> !OSD.equalsIgnoreCase(code))
                .sorted()
                .toList();
    }

    /**
     * {@code languages} with Chinese and Japanese moved to the front, otherwise in order. Tesseract
     * leans on the first language: with English first, Chinese and Japanese pages had 7 to 15 times
     * the character errors of the same pages with their own language first.
     */
    public static List<String> cjkFirst(List<String> languages) {
        return Stream.concat(
                        languages.stream().filter(OcrLanguages::isCjk),
                        languages.stream().filter(code -> !isCjk(code)))
                .toList();
    }

    private static boolean isCjk(String code) {
        return code.startsWith("chi_") || code.startsWith("jpn");
    }

    /**
     * Whether languages can be added to {@code tessdataDir}: only in the desktop app, because core
     * has no admin check, and only where the folder can be written.
     */
    public static boolean canInstall(String tessdataDir) {
        if (!desktopApp() || tessdataDir == null) return false;
        Path dir = Path.of(tessdataDir);
        Path probe = Files.exists(dir) ? dir : dir.toAbsolutePath().getParent();
        return probe != null && Files.isWritable(probe);
    }

    static boolean desktopApp() {
        return Boolean.parseBoolean(System.getProperty("STIRLING_PDF_TAURI_MODE", "false"));
    }
}
