package stirling.software.proprietary.service.ua;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.font.PDFont;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

/**
 * Embeds any font the document references but does not carry, as PDF/UA-1 clause 7.21 requires.
 * Ghostscript does the embedding and discards the structure tree, so this must run before tagging.
 */
@ApplicationScoped
@Slf4j
public class FontEmbeddingService {

    public boolean hasUnembeddedFonts(byte[] pdfBytes) {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            return !findUnembeddedFonts(document).isEmpty();
        } catch (IOException e) {
            log.debug("Could not inspect fonts: {}", e.getMessage());
            return false;
        }
    }

    public static Set<String> findUnembeddedFonts(PDDocument document) {
        Set<String> missing = new HashSet<>();
        for (PDPage page : document.getPages()) {
            PDResources resources = page.getResources();
            if (resources == null) {
                continue;
            }
            for (COSName name : resources.getFontNames()) {
                try {
                    PDFont font = resources.getFont(name);
                    if (font != null && !font.isEmbedded()) {
                        missing.add(font.getName());
                    }
                } catch (IOException e) {
                    log.debug("Could not read font {}: {}", name.getName(), e.getMessage());
                }
            }
        }
        return missing;
    }

    /**
     * Returns the document with all fonts embedded, or the input unchanged. Never throws: failing
     * to embed is a reportable shortfall, not a reason to abandon the conversion.
     */
    public Result embedFonts(byte[] pdfBytes) {
        Set<String> missing;
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            missing = findUnembeddedFonts(document);
        } catch (IOException e) {
            return new Result(
                    pdfBytes, false, Set.of(), "Could not inspect fonts: " + e.getMessage());
        }
        if (missing.isEmpty()) {
            return new Result(pdfBytes, false, Set.of(), null);
        }
        if (!isGhostscriptAvailable()) {
            return new Result(
                    pdfBytes,
                    false,
                    missing,
                    "Ghostscript is not installed, so "
                            + missing.size()
                            + " unembedded font(s) could not be embedded. PDF/UA requires every font"
                            + " to be embedded.");
        }

        Path workingDir = null;
        try {
            workingDir = Files.createTempDirectory("pdfua_fonts_");
            Path input = workingDir.resolve("input.pdf");
            Path output = workingDir.resolve("output.pdf");
            Files.write(input, pdfBytes);

            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                            .runCommandWithOutputHandling(command(input, output, workingDir));

            if (result.getRc() != 0 || !Files.exists(output)) {
                return new Result(
                        pdfBytes,
                        false,
                        missing,
                        "Font embedding failed with code " + result.getRc());
            }
            byte[] embedded = Files.readAllBytes(output);

            // Ghostscript can exit 0 having written a blank page, so keep the original rather than
            // return an empty document.
            if (!survived(pdfBytes, embedded)) {
                log.warn("Ghostscript produced a degenerate document; keeping the original");
                return new Result(
                        pdfBytes,
                        false,
                        missing,
                        "Font embedding was skipped because the embedder returned a document that"
                                + " had lost content. "
                                + missing.size()
                                + " font(s) remain unembedded.");
            }

            // It can also exit 0 while simply leaving fonts unembedded.
            Set<String> remaining;
            try (PDDocument check = Loader.loadPDF(embedded)) {
                remaining = findUnembeddedFonts(check);
            }
            if (!remaining.isEmpty()) {
                return new Result(
                        embedded,
                        true,
                        remaining,
                        remaining.size()
                                + " font(s) could not be embedded ("
                                + String.join(", ", remaining)
                                + "). PDF/UA requires every font to be embedded.");
            }
            log.info("Embedded {} previously unembedded font(s)", missing.size());
            return new Result(embedded, true, missing, null);

        } catch (Exception e) {
            log.warn("Font embedding failed: {}", e.getMessage());
            return new Result(pdfBytes, false, missing, "Font embedding failed: " + e.getMessage());
        } finally {
            deleteQuietly(workingDir);
        }
    }

    /**
     * True when the rewritten document still holds the original's content. A collapse in page count
     * or content-stream size is the only signature of a failed rewrite the exit code hides.
     */
    private static boolean survived(byte[] original, byte[] rewritten) {
        try (PDDocument before = Loader.loadPDF(original);
                PDDocument after = Loader.loadPDF(rewritten)) {
            if (after.getNumberOfPages() != before.getNumberOfPages()) {
                return false;
            }
            long beforeBytes = contentBytes(before);
            long afterBytes = contentBytes(after);
            if (beforeBytes == 0) {
                return true;
            }
            return afterBytes * 20L >= beforeBytes;
        } catch (IOException e) {
            log.debug("Could not compare documents after embedding: {}", e.getMessage());
            return false;
        }
    }

    private static long contentBytes(PDDocument document) {
        long total = 0;
        for (PDPage page : document.getPages()) {
            try (InputStream in = page.getContents()) {
                if (in != null) {
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = in.read(buffer)) > 0) {
                        total += read;
                    }
                }
            } catch (IOException e) {
                log.debug("Could not measure page content: {}", e.getMessage());
            }
        }
        return total;
    }

    private static List<String> command(Path input, Path output, Path workingDir) {
        List<String> command = new ArrayList<>();
        command.add("gs");
        command.add("--permit-file-read=" + workingDir.toAbsolutePath());
        command.add("--permit-file-write=" + workingDir.toAbsolutePath());
        command.add("-sDEVICE=pdfwrite");
        command.add("-dEmbedAllFonts=true");
        command.add("-dSubsetFonts=true");
        command.add("-dCompressFonts=true");
        command.add("-dNOSUBSTFONTS=false");
        command.add("-dPDFSETTINGS=/prepress");
        command.add("-dNOPAUSE");
        command.add("-dBATCH");
        command.add("-sOutputFile=" + output.toAbsolutePath());
        command.add(input.toAbsolutePath().toString());
        return command;
    }

    /** Cached after the first probe: availability does not change mid-process. */
    private volatile Boolean ghostscriptAvailable;

    private boolean isGhostscriptAvailable() {
        Boolean cached = ghostscriptAvailable;
        if (cached != null) {
            return cached;
        }
        boolean available;
        try {
            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                            .runCommandWithOutputHandling(List.of("gs", "--version"));
            available = result.getRc() == 0;
        } catch (Exception e) {
            log.debug("Ghostscript availability check failed: {}", e.getMessage());
            available = false;
        }
        ghostscriptAvailable = available;
        return available;
    }

    private static void deleteQuietly(Path directory) {
        if (directory == null) {
            return;
        }
        try (Stream<Path> stream = Files.walk(directory)) {
            stream.sorted(Comparator.reverseOrder())
                    .forEach(
                            path -> {
                                try {
                                    Files.deleteIfExists(path);
                                } catch (IOException e) {
                                    log.debug("Could not delete {}", path);
                                }
                            });
        } catch (IOException e) {
            log.debug("Could not clean {}", directory);
        }
    }

    /**
     * @param warning non-null when fonts remain unembedded, for the conversion report
     */
    public record Result(byte[] pdfBytes, boolean changed, Set<String> fonts, String warning) {}
}
