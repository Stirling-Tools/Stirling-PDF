package stirling.software.SPDF.service;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.SignatureFile;
import stirling.software.SPDF.model.api.signature.SavedSignatureRequest;
import stirling.software.SPDF.model.api.signature.SavedSignatureResponse;
import stirling.software.common.configuration.InstallationPathConfig;

@Service
@Slf4j
public class SharedSignatureService {

    private static final Pattern FILENAME_VALIDATION_PATTERN = Pattern.compile("^[a-zA-Z0-9_.-]+$");
    private final String SIGNATURE_BASE_PATH;
    private final String ALL_USERS_FOLDER = "ALL_USERS";
    private final ObjectMapper objectMapper;

    public SharedSignatureService() {
        SIGNATURE_BASE_PATH = InstallationPathConfig.getSignaturesPath();
        this.objectMapper = new ObjectMapper();
    }

    public boolean hasAccessToFile(String username, String fileName) throws IOException {
        validateFileName(fileName);
        // Check if file exists in user's personal folder or ALL_USERS folder
        Path userPath = Paths.get(SIGNATURE_BASE_PATH, username, fileName);
        Path allUsersPath = Paths.get(SIGNATURE_BASE_PATH, ALL_USERS_FOLDER, fileName);

        return Files.exists(userPath) || Files.exists(allUsersPath);
    }

    public List<SignatureFile> getAvailableSignatures(String username) {
        List<SignatureFile> signatures = new ArrayList<>();

        // Get signatures from user's personal folder
        if (StringUtils.hasText(username)) {
            Path userFolder = Paths.get(SIGNATURE_BASE_PATH, username);
            if (Files.exists(userFolder)) {
                try {
                    signatures.addAll(getSignaturesFromFolder(userFolder, "Personal"));
                } catch (IOException e) {
                    log.error("Error reading user signatures folder", e);
                }
            }
        }

        // Get signatures from ALL_USERS folder
        Path allUsersFolder = Paths.get(SIGNATURE_BASE_PATH, ALL_USERS_FOLDER);
        if (Files.exists(allUsersFolder)) {
            try {
                signatures.addAll(getSignaturesFromFolder(allUsersFolder, "Shared"));
            } catch (IOException e) {
                log.error("Error reading shared signatures folder", e);
            }
        }

        return signatures;
    }

    private List<SignatureFile> getSignaturesFromFolder(Path folder, String category)
            throws IOException {
        try (Stream<Path> stream = Files.list(folder)) {
            return stream.filter(this::isImageFile)
                    .map(path -> new SignatureFile(path.getFileName().toString(), category))
                    .toList();
        }
    }

    /**
     * Get a signature from the shared (ALL_USERS) folder. This is always available for both
     * authenticated and unauthenticated users.
     */
    public byte[] getSharedSignatureBytes(String fileName) throws IOException {
        validateFileName(fileName);
        Path allUsersPath = Paths.get(SIGNATURE_BASE_PATH, ALL_USERS_FOLDER, fileName);
        if (!Files.exists(allUsersPath)) {
            throw new FileNotFoundException("Shared signature file not found");
        }
        return Files.readAllBytes(allUsersPath);
    }

    private boolean isImageFile(Path path) {
        String fileName = path.getFileName().toString().toLowerCase();
        return fileName.endsWith(".jpg") || fileName.endsWith(".jpeg") || fileName.endsWith(".png");
    }

    private void validateFileName(String fileName) {
        if (fileName.contains("..") || fileName.contains("/") || fileName.contains("\\")) {
            throw new IllegalArgumentException("Invalid filename");
        }
        // Only allow alphanumeric, hyphen, underscore, and dot (for extensions)
        if (!FILENAME_VALIDATION_PATTERN.matcher(fileName).matches()) {
            throw new IllegalArgumentException("Filename contains invalid characters");
        }
    }

    private String validateAndNormalizeExtension(String extension) {
        String normalized = extension.toLowerCase().trim();
        // Whitelist only safe image extensions
        if ("png".equals(normalized) || "jpg".equals(normalized) || "jpeg".equals(normalized)) {
            return normalized;
        }
        throw new IllegalArgumentException("Unsupported image extension: " + extension);
    }

    private void verifyPathWithinDirectory(Path resolvedPath, Path targetDirectory)
            throws IOException {
        Path canonicalTarget = targetDirectory.toAbsolutePath().normalize();
        Path canonicalResolved = resolvedPath.toAbsolutePath().normalize();
        if (!canonicalResolved.startsWith(canonicalTarget)) {
            throw new IOException("Resolved path is outside the target directory");
        }
    }

    /** Save a signature as image file */
    public SavedSignatureResponse saveSignature(String username, SavedSignatureRequest request)
            throws IOException {
        validateFileName(request.getId());

        // Determine folder based on scope
        String scope = request.getScope();
        if (scope == null || scope.isEmpty()) {
            scope = "personal"; // Default to personal
        }

        String folderName = "shared".equals(scope) ? ALL_USERS_FOLDER : username;
        Path targetFolder = Paths.get(SIGNATURE_BASE_PATH, folderName);
        Files.createDirectories(targetFolder);

        long timestamp = System.currentTimeMillis();

        SavedSignatureResponse response = new SavedSignatureResponse();
        response.setId(request.getId());
        response.setLabel(request.getLabel());
        response.setType(request.getType());
        response.setScope(scope);
        response.setCreatedAt(timestamp);
        response.setUpdatedAt(timestamp);

        // Extract and save image data
        String dataUrl = request.getDataUrl();
        if (dataUrl != null && dataUrl.startsWith("data:image/")) {
            // Extract base64 data
            String base64Data = dataUrl.substring(dataUrl.indexOf(",") + 1);
            byte[] imageBytes = Base64.getDecoder().decode(base64Data);

            // Determine and validate file extension from data URL
            String mimeType = dataUrl.substring(dataUrl.indexOf(":") + 1, dataUrl.indexOf(";"));
            String rawExtension = mimeType.substring(mimeType.indexOf("/") + 1);
            String extension = validateAndNormalizeExtension(rawExtension);

            // Save image file only
            String imageFileName = request.getId() + "." + extension;
            Path imagePath = targetFolder.resolve(imageFileName);

            // Verify path is within target directory
            verifyPathWithinDirectory(imagePath, targetFolder);

            Files.write(
                    imagePath,
                    imageBytes,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING);

            // Store reference to image file
            response.setDataUrl("/api/v1/general/signatures/" + imageFileName);
        }

        log.info("Saved signature {} for user {}", request.getId(), username);
        return response;
    }

    /** Get all saved signatures for a user */
    public List<SavedSignatureResponse> getSavedSignatures(String username) throws IOException {
        List<SavedSignatureResponse> signatures = new ArrayList<>();

        // Load personal signatures
        Path personalFolder = Paths.get(SIGNATURE_BASE_PATH, username);
        if (Files.exists(personalFolder)) {
            try (Stream<Path> stream = Files.list(personalFolder)) {
                stream.filter(this::isImageFile)
                        .forEach(
                                path -> {
                                    try {
                                        String fileName = path.getFileName().toString();
                                        String id =
                                                fileName.substring(0, fileName.lastIndexOf('.'));

                                        SavedSignatureResponse sig = new SavedSignatureResponse();
                                        sig.setId(id);
                                        sig.setLabel(id); // Use ID as label
                                        sig.setType("image"); // Default type
                                        sig.setScope("personal");
                                        sig.setDataUrl("/api/v1/general/signatures/" + fileName);
                                        sig.setCreatedAt(
                                                Files.getLastModifiedTime(path).toMillis());
                                        sig.setUpdatedAt(
                                                Files.getLastModifiedTime(path).toMillis());

                                        signatures.add(sig);
                                    } catch (IOException e) {
                                        log.error("Error reading signature file: " + path, e);
                                    }
                                });
            }
        }

        // Load shared signatures
        Path sharedFolder = Paths.get(SIGNATURE_BASE_PATH, ALL_USERS_FOLDER);
        if (Files.exists(sharedFolder)) {
            try (Stream<Path> stream = Files.list(sharedFolder)) {
                stream.filter(this::isImageFile)
                        .forEach(
                                path -> {
                                    try {
                                        String fileName = path.getFileName().toString();
                                        String id =
                                                fileName.substring(0, fileName.lastIndexOf('.'));

                                        SavedSignatureResponse sig = new SavedSignatureResponse();
                                        sig.setId(id);
                                        sig.setLabel(id); // Use ID as label
                                        sig.setType("image"); // Default type
                                        sig.setScope("shared");
                                        sig.setDataUrl("/api/v1/general/signatures/" + fileName);
                                        sig.setCreatedAt(
                                                Files.getLastModifiedTime(path).toMillis());
                                        sig.setUpdatedAt(
                                                Files.getLastModifiedTime(path).toMillis());

                                        signatures.add(sig);
                                    } catch (IOException e) {
                                        log.error("Error reading signature file: " + path, e);
                                    }
                                });
            }
        }

        return signatures;
    }

    /** Delete a saved signature */
    public void deleteSignature(String username, String signatureId) throws IOException {
        validateFileName(signatureId);

        // Try to find and delete image file in personal folder
        Path personalFolder = Paths.get(SIGNATURE_BASE_PATH, username);
        boolean deleted = false;

        if (Files.exists(personalFolder)) {
            try (Stream<Path> stream = Files.list(personalFolder)) {
                List<Path> matchingFiles =
                        stream.filter(
                                        path ->
                                                path.getFileName()
                                                        .toString()
                                                        .startsWith(signatureId + "."))
                                .toList();
                for (Path file : matchingFiles) {
                    Files.delete(file);
                    deleted = true;
                }
            }
        }

        // Try shared folder if not found in personal
        if (!deleted) {
            Path sharedFolder = Paths.get(SIGNATURE_BASE_PATH, ALL_USERS_FOLDER);
            if (Files.exists(sharedFolder)) {
                try (Stream<Path> stream = Files.list(sharedFolder)) {
                    List<Path> matchingFiles =
                            stream.filter(
                                            path ->
                                                    path.getFileName()
                                                            .toString()
                                                            .startsWith(signatureId + "."))
                                    .toList();
                    for (Path file : matchingFiles) {
                        Files.delete(file);
                        deleted = true;
                    }
                }
            }
        }

        if (!deleted) {
            throw new FileNotFoundException("Signature not found");
        }

        log.info("Deleted signature {} for user {}", signatureId, username);
    }
}
