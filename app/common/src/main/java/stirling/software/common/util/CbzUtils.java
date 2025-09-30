package stirling.software.common.util;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.List;
import java.util.regex.Pattern;
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

    private final Pattern IMAGE_PATTERN =
            Pattern.compile(".*\\.(jpg|jpeg|png|gif|bmp|webp)$", Pattern.CASE_INSENSITIVE);

    public byte[] convertCbzToPdf(
            MultipartFile cbzFile,
            CustomPDFDocumentFactory pdfDocumentFactory,
            TempFileManager tempFileManager)
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
                    throw new IllegalArgumentException("Archive is empty or invalid ZIP");
                }
            } catch (IOException e) {
                throw new IllegalArgumentException("Invalid CBZ/ZIP archive", e);
            }

            try (PDDocument document = pdfDocumentFactory.createNewDocument();
                    ZipFile zipFile = new ZipFile(tempFile.getFile())) {
                Enumeration<? extends ZipEntry> entries = zipFile.entries();
                List<ImageEntryData> imageEntries = new ArrayList<>();
                while (entries.hasMoreElements()) {
                    ZipEntry entry = entries.nextElement();
                    if (!entry.isDirectory() && isImageFile(entry.getName())) {
                        try (InputStream is = zipFile.getInputStream(entry)) {
                            ByteArrayOutputStream baos = new ByteArrayOutputStream();
                            is.transferTo(baos);
                            imageEntries.add(
                                    new ImageEntryData(entry.getName(), baos.toByteArray()));
                        } catch (IOException e) {
                            log.warn("Error reading image {}: {}", entry.getName(), e.getMessage());
                        }
                    }
                }

                imageEntries.sort(
                        Comparator.comparing(ImageEntryData::name, new NaturalOrderComparator()));

                if (imageEntries.isEmpty()) {
                    throw new IllegalArgumentException("No valid images found in the CBZ file");
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
                                new PDPageContentStream(document, page)) {
                            contentStream.drawImage(pdImage, 0, 0);
                        }
                    } catch (IOException e) {
                        log.warn(
                                "Error processing image {}: {}", imageEntry.name(), e.getMessage());
                    }
                }

                if (document.getNumberOfPages() == 0) {
                    throw new IllegalArgumentException(
                            "No images could be processed from the CBZ file");
                }
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                document.save(baos);
                return baos.toByteArray();
            }
        }
    }

    private void validateCbzFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File cannot be null or empty");
        }

        String filename = file.getOriginalFilename();
        if (filename == null) {
            throw new IllegalArgumentException("File must have a name");
        }

        String extension = FilenameUtils.getExtension(filename).toLowerCase();
        if (!"cbz".equals(extension) && !"zip".equals(extension)) {
            throw new IllegalArgumentException("File must be a CBZ or ZIP archive");
        }
    }

    public boolean isCbzFile(MultipartFile file) {
        String filename = file.getOriginalFilename();
        if (filename == null) {
            return false;
        }

        String extension = FilenameUtils.getExtension(filename).toLowerCase();
        return "cbz".equals(extension) || "zip".equals(extension);
    }

    private boolean isImageFile(String filename) {
        return IMAGE_PATTERN.matcher(filename).matches();
    }

    private record ImageEntryData(String name, byte[] data) {}

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
