package stirling.software.SPDF.utils;

import io.github.pixee.security.HostValidator;
import io.github.pixee.security.Urls;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.net.URL;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;

import org.springframework.web.multipart.MultipartFile;

public class GeneralUtils {

    public static File convertMultipartFileToFile(MultipartFile multipartFile) throws IOException {
        File tempFile = File.createTempFile("temp", null);
        try (FileOutputStream os = new FileOutputStream(tempFile)) {
            os.write(multipartFile.getBytes());
        }
        return tempFile;
    }

    public static void deleteDirectory(Path path) throws IOException {
        Files.walkFileTree(
                path,
                new SimpleFileVisitor<Path>() {
                    @Override
                    public FileVisitResult visitFile(Path file, BasicFileAttributes attrs)
                            throws IOException {
                        Files.delete(file);
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult postVisitDirectory(Path dir, IOException exc)
                            throws IOException {
                        Files.delete(dir);
                        return FileVisitResult.CONTINUE;
                    }
                });
    }

    public static String convertToFileName(String name) {
        String safeName = name.replaceAll("[^a-zA-Z0-9]", "_");
        if (safeName.length() > 50) {
            safeName = safeName.substring(0, 50);
        }
        return safeName;
    }

    public static boolean isValidURL(String urlStr) {
        try {
            Urls.create(urlStr, Urls.HTTP_PROTOCOLS, HostValidator.DENY_COMMON_INFRASTRUCTURE_TARGETS);
            return true;
        } catch (MalformedURLException e) {
            return false;
        }
    }

    public static File multipartToFile(MultipartFile multipart) throws IOException {
        Path tempFile = Files.createTempFile("overlay-", ".pdf");
        try (InputStream in = multipart.getInputStream();
                FileOutputStream out = new FileOutputStream(tempFile.toFile())) {
            byte[] buffer = new byte[1024];
            int bytesRead;
            while ((bytesRead = in.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
            }
        }
        return tempFile.toFile();
    }

    public static Long convertSizeToBytes(String sizeStr) {
        if (sizeStr == null) {
            return null;
        }

        sizeStr = sizeStr.trim().toUpperCase();
        try {
            if (sizeStr.endsWith("KB")) {
                return (long)
                        (Double.parseDouble(sizeStr.substring(0, sizeStr.length() - 2)) * 1024);
            } else if (sizeStr.endsWith("MB")) {
                return (long)
                        (Double.parseDouble(sizeStr.substring(0, sizeStr.length() - 2))
                                * 1024
                                * 1024);
            } else if (sizeStr.endsWith("GB")) {
                return (long)
                        (Double.parseDouble(sizeStr.substring(0, sizeStr.length() - 2))
                                * 1024
                                * 1024
                                * 1024);
            } else if (sizeStr.endsWith("B")) {
                return Long.parseLong(sizeStr.substring(0, sizeStr.length() - 1));
            } else {
                // Assume MB if no unit is specified
                return (long) (Double.parseDouble(sizeStr) * 1024 * 1024);
            }
        } catch (NumberFormatException e) {
            // The numeric part of the input string cannot be parsed, handle this case
        }

        return null;
    }

    public static List<Integer> parsePageString(String pageOrder, int totalPages) {
        return parsePageList(pageOrder.split(","), totalPages);
    }

    public static List<Integer> parsePageList(String[] pageOrderArr, int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();

        // loop through the page order array
        for (String element : pageOrderArr) {
            if (element.equalsIgnoreCase("all")) {
                for (int i = 0; i < totalPages; i++) {
                    newPageOrder.add(i);
                }
                // As all pages are already added, no need to check further
                break;
            } else if (element.matches("\\d*n\\+?-?\\d*|\\d*\\+?n")) {
                // Handle page order as a function
                int coefficient = 0;
                int constant = 0;
                boolean coefficientExists = false;
                boolean constantExists = false;

                if (element.contains("n")) {
                    String[] parts = element.split("n");
                    if (!parts[0].equals("") && parts[0] != null) {
                        coefficient = Integer.parseInt(parts[0]);
                        coefficientExists = true;
                    }
                    if (parts.length > 1 && !parts[1].equals("") && parts[1] != null) {
                        constant = Integer.parseInt(parts[1]);
                        constantExists = true;
                    }
                } else if (element.contains("+")) {
                    constant = Integer.parseInt(element.replace("+", ""));
                    constantExists = true;
                }

                for (int i = 1; i <= totalPages; i++) {
                    int pageNum = coefficientExists ? coefficient * i : i;
                    pageNum += constantExists ? constant : 0;

                    if (pageNum <= totalPages && pageNum > 0) {
                        newPageOrder.add(pageNum - 1);
                    }
                }
            } else if (element.contains("-")) {
                // split the range into start and end page
                String[] range = element.split("-");
                int start = Integer.parseInt(range[0]);
                int end = Integer.parseInt(range[1]);
                // check if the end page is greater than total pages
                if (end > totalPages) {
                    end = totalPages;
                }
                // loop through the range of pages
                for (int j = start; j <= end; j++) {
                    // print the current index
                    newPageOrder.add(j - 1);
                }
            } else {
                // if the element is a single page
                newPageOrder.add(Integer.parseInt(element) - 1);
            }
        }

        return newPageOrder;
    }

    public static boolean createDir(String path) {
        Path folder = Paths.get(path);
        if (!Files.exists(folder)) {
            try {
                Files.createDirectories(folder);
            } catch (IOException e) {
                e.printStackTrace();
                return false;
            }
        }
        return true;
    }
}
