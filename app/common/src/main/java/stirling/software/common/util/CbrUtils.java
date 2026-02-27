package stirling.software.common.util;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import org.apache.commons.io.FilenameUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.web.multipart.MultipartFile;

import com.github.junrar.Archive;
import com.github.junrar.exception.CorruptHeaderException;
import com.github.junrar.exception.RarException;
import com.github.junrar.rarfile.FileHeader;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

@Slf4j
@UtilityClass
public class CbrUtils {

    public byte[] convertCbrToPdf(
            MultipartFile cbrFile,
            CustomPDFDocumentFactory pdfDocumentFactory,
            TempFileManager tempFileManager)
            throws IOException {
        return convertCbrToPdf(cbrFile, pdfDocumentFactory, tempFileManager, false);
    }

    public byte[] convertCbrToPdf(
            MultipartFile cbrFile,
            CustomPDFDocumentFactory pdfDocumentFactory,
            TempFileManager tempFileManager,
            boolean optimizeForEbook)
            throws IOException {

        validateCbrFile(cbrFile);

        // Try Calibre first (preferred method - preserves color and quality)
        try {
            return convertCbrToPdfWithCalibre(
                    cbrFile, pdfDocumentFactory, tempFileManager, optimizeForEbook);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Calibre CBR conversion interrupted, falling back to JunRAR");
            // Fall through to JunRAR method
        } catch (Exception e) {
            log.warn("Calibre CBR conversion failed, falling back to JunRAR: {}", e.getMessage());
            // Fall through to JunRAR method
        }

        // Fallback to JunRAR method
        return convertCbrToPdfWithJunrar(
                cbrFile, pdfDocumentFactory, tempFileManager, optimizeForEbook);
    }

    /**
     * Converts CBR to PDF using Calibre's ebook-convert tool. This method preserves color images
     * and maintains original quality.
     *
     * @param cbrFile the input CBR file
     * @param pdfDocumentFactory PDF document factory
     * @param tempFileManager temporary file manager
     * @param optimizeForEbook whether to optimize for ebook reading
     * @return PDF bytes
     * @throws IOException if conversion fails
     * @throws InterruptedException if the process is interrupted
     */
    private byte[] convertCbrToPdfWithCalibre(
            MultipartFile cbrFile,
            CustomPDFDocumentFactory pdfDocumentFactory,
            TempFileManager tempFileManager,
            boolean optimizeForEbook)
            throws IOException, InterruptedException {

        // Check if Calibre is available
        if (!CheckProgramInstall.isCalibreAvailable()) {
            throw new IllegalStateException("Calibre is not available");
        }

        String originalFilename = cbrFile.getOriginalFilename();
        if (originalFilename == null) {
            originalFilename = "comic.cbr";
        }

        String baseName = FilenameUtils.getBaseName(originalFilename);
        if (baseName == null || baseName.isBlank()) {
            baseName = "comic";
        }

        Path workingDirectory = tempFileManager.createTempDirectory();
        Path inputPath = workingDirectory.resolve(baseName + ".cbr");
        Path outputPath = workingDirectory.resolve(baseName + ".pdf");

        try (InputStream inputStream = cbrFile.getInputStream()) {
            Files.copy(inputStream, inputPath, StandardCopyOption.REPLACE_EXISTING);
        }

        // Build Calibre command with color preservation flags
        List<String> command = new ArrayList<>();
        command.add("ebook-convert");
        command.add(inputPath.toString());
        command.add(outputPath.toString());
        // Critical: Disable grayscale conversion to preserve color images
        command.add("--dont-grayscale");
        // Preserve aspect ratio to prevent image distortion
        command.add("--keep-aspect-ratio");

        ProcessExecutorResult result =
                ProcessExecutor.getInstance(ProcessExecutor.Processes.CALIBRE)
                        .runCommandWithOutputHandling(command, workingDirectory.toFile());

        if (result == null) {
            throw new IllegalStateException("Calibre conversion returned no result");
        }

        if (result.getRc() != 0) {
            String errorMessage = result.getMessages();
            if (errorMessage == null || errorMessage.isBlank()) {
                errorMessage = "Calibre conversion failed";
            }
            throw new IllegalStateException(errorMessage);
        }

        if (!Files.exists(outputPath) || Files.size(outputPath) == 0L) {
            throw new IllegalStateException("Calibre did not produce a PDF output");
        }

        byte[] pdfBytes = Files.readAllBytes(outputPath);

        // Apply Ghostscript optimization if requested
        if (optimizeForEbook) {
            try {
                pdfBytes = GeneralUtils.optimizePdfWithGhostscript(pdfBytes);
            } catch (IOException e) {
                log.warn(
                        "Ghostscript optimization failed for CBR conversion, returning unoptimized"
                                + " PDF",
                        e);
            }
        }

        return pdfBytes;
    }

    /**
     * Converts CBR to PDF using JunRAR library (fallback method). Extracts images from RAR archive
     * and creates PDF pages.
     *
     * @param cbrFile the input CBR file
     * @param pdfDocumentFactory PDF document factory
     * @param tempFileManager temporary file manager
     * @param optimizeForEbook whether to optimize for ebook reading
     * @return PDF bytes
     * @throws IOException if conversion fails
     */
    private byte[] convertCbrToPdfWithJunrar(
            MultipartFile cbrFile,
            CustomPDFDocumentFactory pdfDocumentFactory,
            TempFileManager tempFileManager,
            boolean optimizeForEbook)
            throws IOException {

        try (TempFile tempFile = new TempFile(tempFileManager, ".cbr")) {
            cbrFile.transferTo(tempFile.getFile());

            try (PDDocument document = pdfDocumentFactory.createNewDocument()) {

                Archive archive;
                try {
                    archive = new Archive(tempFile.getFile());
                } catch (CorruptHeaderException e) {
                    log.warn(
                            "Failed to open CBR/RAR archive due to corrupt header: {}",
                            e.getMessage());
                    throw ExceptionUtils.createCbrInvalidFormatException(null);
                } catch (RarException e) {
                    log.warn("Failed to open CBR/RAR archive: {}", e.getMessage());
                    String exMessage = e.getMessage() != null ? e.getMessage() : "";

                    if (exMessage.contains("encrypted")) {
                        throw ExceptionUtils.createCbrEncryptedException();
                    } else if (exMessage.isEmpty()) {
                        throw ExceptionUtils.createCbrInvalidFormatException(
                                "Invalid CBR/RAR archive. The file may be encrypted, corrupted, or"
                                        + " use an unsupported format.");
                    } else {
                        throw ExceptionUtils.createCbrInvalidFormatException(
                                "Invalid CBR/RAR archive: "
                                        + exMessage
                                        + ". The file may be encrypted, corrupted, or use an"
                                        + " unsupported format.");
                    }
                } catch (IOException e) {
                    log.warn("IO error reading CBR/RAR archive: {}", e.getMessage());
                    throw ExceptionUtils.createFileProcessingException("CBR extraction", e);
                }

                List<ImageEntryData> imageEntries = new ArrayList<>();

                try {
                    for (FileHeader fileHeader : archive) {
                        if (!fileHeader.isDirectory() && isImageFile(fileHeader.getFileName())) {
                            try (InputStream is = archive.getInputStream(fileHeader)) {
                                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                                is.transferTo(baos);
                                imageEntries.add(
                                        new ImageEntryData(
                                                fileHeader.getFileName(), baos.toByteArray()));
                            } catch (Exception e) {
                                log.warn(
                                        "Error reading image {}: {}",
                                        fileHeader.getFileName(),
                                        e.getMessage());
                            }
                        }
                    }
                } finally {
                    try {
                        archive.close();
                    } catch (IOException e) {
                        log.warn("Error closing CBR/RAR archive: {}", e.getMessage());
                    }
                }

                imageEntries.sort(
                        Comparator.comparing(ImageEntryData::name, new NaturalOrderComparator()));

                if (imageEntries.isEmpty()) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.fileProcessing",
                            "No valid images found in the CBR file. The archive may be empty or"
                                    + " contain no supported image formats.");
                }

                for (ImageEntryData imageEntry : imageEntries) {
                    try {
                        PDImageXObject pdImage =
                                PDImageXObject.createFromByteArray(
                                        document, imageEntry.data(), imageEntry.name());
                        PDPage page =
                                new PDPage(
                                        new PDRectangle(pdImage.getWidth(), pdImage.getHeight()));
                        document.addPage(page);
                        try (PDPageContentStream contentStream =
                                new PDPageContentStream(
                                        document,
                                        page,
                                        PDPageContentStream.AppendMode.OVERWRITE,
                                        true,
                                        true)) {
                            contentStream.drawImage(pdImage, 0, 0);
                        }
                    } catch (IOException e) {
                        log.warn(
                                "Error processing image {}: {}", imageEntry.name(), e.getMessage());
                    }
                }

                if (document.getNumberOfPages() == 0) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.fileProcessing",
                            "No images could be processed from the CBR file. All images may be"
                                    + " corrupted or in unsupported formats.");
                }

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                document.save(baos);
                byte[] pdfBytes = baos.toByteArray();

                // Apply Ghostscript optimization if requested
                if (optimizeForEbook) {
                    try {
                        return GeneralUtils.optimizePdfWithGhostscript(pdfBytes);
                    } catch (IOException e) {
                        log.warn("Ghostscript optimization failed, returning unoptimized PDF", e);
                    }
                }

                return pdfBytes;
            }
        }
    }

    private void validateCbrFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ExceptionUtils.createFileNullOrEmptyException();
        }

        String filename = file.getOriginalFilename();
        if (filename == null) {
            throw ExceptionUtils.createFileNoNameException();
        }

        String extension = FilenameUtils.getExtension(filename).toLowerCase(Locale.ROOT);
        if (!"cbr".equals(extension) && !"rar".equals(extension)) {
            throw ExceptionUtils.createNotCbrFileException();
        }
    }

    public boolean isCbrFile(MultipartFile file) {
        String filename = file.getOriginalFilename();
        if (filename == null) {
            return false;
        }

        String extension = FilenameUtils.getExtension(filename).toLowerCase(Locale.ROOT);
        return "cbr".equals(extension) || "rar".equals(extension);
    }

    private boolean isImageFile(String filename) {
        return RegexPatternUtils.getInstance().getImageFilePattern().matcher(filename).matches();
    }

    private record ImageEntryData(String name, byte[] data) {}

    private class NaturalOrderComparator implements Comparator<String> {
        private static String getChunk(String s, int length, int marker) {
            StringBuilder chunk = new StringBuilder();
            char c = s.charAt(marker);
            chunk.append(c);
            marker++;

            if (isDigit(c)) {
                while (marker < length && isDigit(s.charAt(marker))) {
                    chunk.append(s.charAt(marker));
                    marker++;
                }
            } else {
                while (marker < length && !isDigit(s.charAt(marker))) {
                    chunk.append(s.charAt(marker));
                    marker++;
                }
            }
            return chunk.toString();
        }

        private static boolean isDigit(char ch) {
            return ch >= '0' && ch <= '9';
        }

        @Override
        public int compare(String s1, String s2) {
            int len1 = s1.length();
            int len2 = s2.length();
            int marker1 = 0, marker2 = 0;

            while (marker1 < len1 && marker2 < len2) {
                String chunk1 = getChunk(s1, len1, marker1);
                marker1 += chunk1.length();

                String chunk2 = getChunk(s2, len2, marker2);
                marker2 += chunk2.length();

                int result;
                if (isDigit(chunk1.charAt(0)) && isDigit(chunk2.charAt(0))) {
                    int thisNumericValue = Integer.parseInt(chunk1);
                    int thatNumericValue = Integer.parseInt(chunk2);
                    result = Integer.compare(thisNumericValue, thatNumericValue);
                } else {
                    result = chunk1.compareTo(chunk2);
                }

                if (result != 0) {
                    return result;
                }
            }

            return Integer.compare(len1, len2);
        }
    }
}
