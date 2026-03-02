package stirling.software.common.util;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipInputStream;

import org.apache.commons.io.FilenameUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.web.multipart.MultipartFile;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;

@Slf4j
@UtilityClass
public class CbzUtils {

    public TempFile convertCbzToPdf(
            MultipartFile cbzFile,
            CustomPDFDocumentFactory pdfDocumentFactory,
            TempFileManager tempFileManager,
            boolean optimizeForEbook)
            throws IOException {

        validateCbzFile(cbzFile);

        try (TempFile tempFile = new TempFile(tempFileManager, ".cbz")) {
            cbzFile.transferTo(tempFile.getFile());

            // Early ZIP validity check using ZipInputStream (fail fast on non-zip content)
            try (BufferedInputStream bis =
                            new BufferedInputStream(
                                    new java.io.FileInputStream(tempFile.getFile()));
                    ZipInputStream zis = new ZipInputStream(bis)) {
                if (zis.getNextEntry() == null) {
                    throw ExceptionUtils.createCbzEmptyException();
                }
            } catch (IOException e) {
                throw ExceptionUtils.createCbzInvalidFormatException(e);
            }

            try (PDDocument document = pdfDocumentFactory.createNewDocument();
                    ZipFile zipFile = new ZipFile(tempFile.getFile())) {

                // Pass 1: collect sorted image names (cheap just strings, no image data)
                List<String> sortedImageNames = new ArrayList<>();
                Enumeration<? extends ZipEntry> entries = zipFile.entries();
                while (entries.hasMoreElements()) {
                    ZipEntry entry = entries.nextElement();
                    if (!entry.isDirectory() && isImageFile(entry.getName())) {
                        sortedImageNames.add(entry.getName());
                    }
                }
                sortedImageNames.sort(new NaturalOrderComparator());

                if (sortedImageNames.isEmpty()) {
                    throw ExceptionUtils.createCbzNoImagesException();
                }

                // Pass 2: load ONE image at a time peak memory = max(single image)
                for (String imageName : sortedImageNames) {
                    ZipEntry entry = zipFile.getEntry(imageName);
                    try (InputStream is = zipFile.getInputStream(entry)) {
                        ByteArrayOutputStream imgBaos = new ByteArrayOutputStream();
                        is.transferTo(imgBaos);
                        byte[] imageBytes = imgBaos.toByteArray();
                        try {
                            PDImageXObject pdImage =
                                    PDImageXObject.createFromByteArray(
                                            document, imageBytes, imageName);
                            PDPage page =
                                    new PDPage(
                                            new PDRectangle(
                                                    pdImage.getWidth(), pdImage.getHeight()));
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
                            log.warn("Error processing image {}: {}", imageName, e.getMessage());
                        }
                        // imageBytes eligible for GC after each iteration
                    } catch (IOException e) {
                        log.warn("Error reading image {}: {}", imageName, e.getMessage());
                    }
                }

                if (document.getNumberOfPages() == 0) {
                    throw ExceptionUtils.createCbzCorruptedImagesException();
                }

                // Write to TempFile (not BAOS)
                TempFile pdfTempFile = new TempFile(tempFileManager, ".pdf");
                try {
                    document.save(pdfTempFile.getFile());

                    if (optimizeForEbook) {
                        try {
                            byte[] pdfBytes = Files.readAllBytes(pdfTempFile.getPath());
                            byte[] optimized = GeneralUtils.optimizePdfWithGhostscript(pdfBytes);
                            pdfTempFile.close();
                            TempFile optimizedFile = new TempFile(tempFileManager, ".pdf");
                            try {
                                Files.write(optimizedFile.getPath(), optimized);
                                return optimizedFile;
                            } catch (Exception e) {
                                optimizedFile.close();
                                throw e;
                            }
                        } catch (IOException e) {
                            log.warn(
                                    "Ghostscript optimization failed, returning unoptimized PDF",
                                    e);
                        }
                    }

                    return pdfTempFile;
                } catch (Exception e) {
                    pdfTempFile.close();
                    throw e;
                }
            }
        }
    }

    private void validateCbzFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ExceptionUtils.createFileNullOrEmptyException();
        }

        String filename = file.getOriginalFilename();
        if (filename == null) {
            throw ExceptionUtils.createFileNoNameException();
        }

        String extension = FilenameUtils.getExtension(filename).toLowerCase(Locale.ROOT);
        if (!"cbz".equals(extension) && !"zip".equals(extension)) {
            throw ExceptionUtils.createNotCbzFileException();
        }
    }

    public boolean isCbzFile(MultipartFile file) {
        String filename = file.getOriginalFilename();
        if (filename == null) {
            return false;
        }

        String extension = FilenameUtils.getExtension(filename).toLowerCase(Locale.ROOT);
        return "cbz".equals(extension) || "zip".equals(extension);
    }

    public static boolean isComicBookFile(MultipartFile file) {
        String filename = file.getOriginalFilename();
        if (filename == null) {
            return false;
        }

        String extension = FilenameUtils.getExtension(filename).toLowerCase(Locale.ROOT);
        return "cbz".equals(extension)
                || "zip".equals(extension)
                || "cbr".equals(extension)
                || "rar".equals(extension);
    }

    private boolean isImageFile(String filename) {
        return RegexPatternUtils.getInstance().getImageFilePattern().matcher(filename).matches();
    }

    private class NaturalOrderComparator implements Comparator<String> {
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
    }
}
