package stirling.software.proprietary.service;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.service.PersonalSignatureServiceInterface;
import stirling.software.proprietary.model.api.signature.SavedSignatureRequest;
import stirling.software.proprietary.model.api.signature.SavedSignatureResponse;

/**
 * Service for managing user signatures with authentication and storage limits. This proprietary
 * version enforces per-user quotas and requires authentication. Provides access to personal
 * signatures only (shared signatures handled by core service).
 */
@Service
@Slf4j
public class SignatureService implements PersonalSignatureServiceInterface {

    private final String SIGNATURE_BASE_PATH;
    private final String ALL_USERS_FOLDER = "ALL_USERS";
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Storage limits per user
    private static final int MAX_SIGNATURES_PER_USER = 20;
    private static final long MAX_SIGNATURE_SIZE_BYTES = 2_000_000; // 2MB per signature
    private static final long MAX_TOTAL_USER_STORAGE_BYTES = 20_000_000; // 20MB total per user

    public SignatureService() {
        SIGNATURE_BASE_PATH = InstallationPathConfig.getSignaturesPath();
    }

    /**
     * Get a personal signature from the user's folder only. Does NOT check shared folder (that's
     * handled by core service).
     */
    @Override
    public byte[] getPersonalSignatureBytes(String username, String fileName) throws IOException {
        validateFileName(fileName);
        Path userPath = Paths.get(SIGNATURE_BASE_PATH, username, fileName);

        if (!Files.exists(userPath)) {
            throw new FileNotFoundException("Personal signature not found");
        }

        return Files.readAllBytes(userPath);
    }

    /** Save a signature with storage limits enforced. */
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

        // Only enforce limits for personal signatures (not shared)
        if ("personal".equals(scope)) {
            enforceStorageLimits(username, request.getDataUrl());
        }

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
            // Validate dataUrl size before decoding
            if (dataUrl.length() > MAX_SIGNATURE_SIZE_BYTES * 2) {
                throw new IllegalArgumentException(
                        "Signature data too large (max "
                                + (MAX_SIGNATURE_SIZE_BYTES / 1024)
                                + "KB)");
            }

            // Extract base64 data
            String base64Data = dataUrl.substring(dataUrl.indexOf(",") + 1);
            byte[] imageBytes = Base64.getDecoder().decode(base64Data);

            // Validate decoded size
            if (imageBytes.length > MAX_SIGNATURE_SIZE_BYTES) {
                throw new IllegalArgumentException(
                        "Signature image too large (max "
                                + (MAX_SIGNATURE_SIZE_BYTES / 1024)
                                + "KB)");
            }

            // Determine and validate file extension from data URL
            String mimeType = dataUrl.substring(dataUrl.indexOf(":") + 1, dataUrl.indexOf(";"));
            String rawExtension = mimeType.substring(mimeType.indexOf("/") + 1);
            String extension = validateAndNormalizeExtension(rawExtension);

            // Save image file
            String imageFileName = request.getId() + "." + extension;
            Path imagePath = targetFolder.resolve(imageFileName);

            // Verify path is within target directory
            verifyPathWithinDirectory(imagePath, targetFolder);

            Files.write(
                    imagePath,
                    imageBytes,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING);

            // Store reference to image file (unified endpoint for all signatures)
            response.setDataUrl("/api/v1/general/signatures/" + imageFileName);
        }

        // Save metadata JSON file
        String metadataFileName = request.getId() + ".json";
        Path metadataPath = targetFolder.resolve(metadataFileName);
        verifyPathWithinDirectory(metadataPath, targetFolder);

        String metadataJson = objectMapper.writeValueAsString(response);
        Files.writeString(
                metadataPath,
                metadataJson,
                StandardCharsets.UTF_8,
                StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING);

        log.info("Saved signature {} for user {} (scope: {})", request.getId(), username, scope);
        return response;
    }

    /** Get all saved signatures for a user (personal + shared). */
    public List<SavedSignatureResponse> getSavedSignatures(String username) throws IOException {
        List<SavedSignatureResponse> signatures = new ArrayList<>();

        // Load personal signatures
        Path personalFolder = Paths.get(SIGNATURE_BASE_PATH, username);
        if (Files.exists(personalFolder)) {
            signatures.addAll(loadSignaturesFromFolder(personalFolder, "personal", true));
        }

        // Load shared signatures
        Path sharedFolder = Paths.get(SIGNATURE_BASE_PATH, ALL_USERS_FOLDER);
        if (Files.exists(sharedFolder)) {
            signatures.addAll(loadSignaturesFromFolder(sharedFolder, "shared", false));
        }

        return signatures;
    }

    /** Delete a signature from user's personal folder. Cannot delete shared signatures. */
    public void deleteSignature(String username, String signatureId) throws IOException {
        validateFileName(signatureId);

        // Only allow deletion from personal folder
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
                    log.info("Deleted signature file: {}", file);
                }
            }

            // Also delete metadata file if it exists
            Path metadataPath = personalFolder.resolve(signatureId + ".json");
            if (Files.exists(metadataPath)) {
                Files.delete(metadataPath);
                log.info("Deleted signature metadata: {}", metadataPath);
            }
        }

        if (!deleted) {
            throw new FileNotFoundException("Signature not found or cannot be deleted");
        }
    }

    /** Update a signature label. */
    public void updateSignatureLabel(String username, String signatureId, String newLabel)
            throws IOException {
        validateFileName(signatureId);

        // Try personal folder first
        Path personalFolder = Paths.get(SIGNATURE_BASE_PATH, username);
        Path metadataPath = personalFolder.resolve(signatureId + ".json");

        if (Files.exists(metadataPath)) {
            updateMetadataLabel(metadataPath, newLabel);
            log.info("Updated label for personal signature {} (user: {})", signatureId, username);
            return;
        }

        // If not found in personal, try shared folder
        Path sharedFolder = Paths.get(SIGNATURE_BASE_PATH, ALL_USERS_FOLDER);
        Path sharedMetadataPath = sharedFolder.resolve(signatureId + ".json");

        if (Files.exists(sharedMetadataPath)) {
            updateMetadataLabel(sharedMetadataPath, newLabel);
            log.info("Updated label for shared signature {}", signatureId);
            return;
        }

        throw new FileNotFoundException("Signature metadata not found");
    }

    private void updateMetadataLabel(Path metadataPath, String newLabel) throws IOException {
        String metadataJson = Files.readString(metadataPath, StandardCharsets.UTF_8);
        SavedSignatureResponse sig =
                objectMapper.readValue(metadataJson, SavedSignatureResponse.class);
        sig.setLabel(newLabel);
        sig.setUpdatedAt(System.currentTimeMillis());

        String updatedJson = objectMapper.writeValueAsString(sig);
        Files.writeString(
                metadataPath,
                updatedJson,
                StandardCharsets.UTF_8,
                StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING);
    }

    // Private helper methods

    private void enforceStorageLimits(String username, String dataUrlToAdd) throws IOException {
        Path userFolder = Paths.get(SIGNATURE_BASE_PATH, username);

        if (!Files.exists(userFolder)) {
            return; // First signature, no limits to check
        }

        // Count existing signatures
        long signatureCount;
        try (Stream<Path> stream = Files.list(userFolder)) {
            signatureCount = stream.filter(this::isImageFile).count();
        }

        if (signatureCount >= MAX_SIGNATURES_PER_USER) {
            throw new IllegalArgumentException(
                    "Maximum signatures limit reached (" + MAX_SIGNATURES_PER_USER + ")");
        }

        // Calculate total storage used
        long totalSize = 0;
        try (Stream<Path> stream = Files.list(userFolder)) {
            totalSize =
                    stream.filter(this::isImageFile)
                            .mapToLong(
                                    path -> {
                                        try {
                                            return Files.size(path);
                                        } catch (IOException e) {
                                            return 0;
                                        }
                                    })
                            .sum();
        }

        // Estimate new signature size (base64 decodes to ~75% of original)
        long estimatedNewSize = (long) (dataUrlToAdd.length() * 0.75);

        if (totalSize + estimatedNewSize > MAX_TOTAL_USER_STORAGE_BYTES) {
            throw new IllegalArgumentException(
                    "Storage quota exceeded (max "
                            + (MAX_TOTAL_USER_STORAGE_BYTES / 1_000_000)
                            + "MB)");
        }
    }

    private List<SavedSignatureResponse> loadSignaturesFromFolder(
            Path folder, String scope, boolean isPersonal) throws IOException {
        List<SavedSignatureResponse> signatures = new ArrayList<>();

        try (Stream<Path> stream = Files.list(folder)) {
            stream.filter(this::isImageFile)
                    .forEach(
                            path -> {
                                try {
                                    String fileName = path.getFileName().toString();
                                    String id = fileName.substring(0, fileName.lastIndexOf('.'));

                                    // Try to load metadata from JSON file
                                    Path metadataPath = folder.resolve(id + ".json");
                                    SavedSignatureResponse sig;

                                    if (Files.exists(metadataPath)) {
                                        // Load from metadata file
                                        String metadataJson =
                                                Files.readString(
                                                        metadataPath, StandardCharsets.UTF_8);
                                        sig =
                                                objectMapper.readValue(
                                                        metadataJson, SavedSignatureResponse.class);
                                    } else {
                                        // Fallback for old signatures without metadata
                                        sig = new SavedSignatureResponse();
                                        sig.setId(id);
                                        sig.setLabel(id);
                                        sig.setType("image");
                                        sig.setScope(scope);
                                        sig.setCreatedAt(
                                                Files.getLastModifiedTime(path).toMillis());
                                        sig.setUpdatedAt(
                                                Files.getLastModifiedTime(path).toMillis());
                                        sig.setDataUrl("/api/v1/general/signatures/" + fileName);
                                    }

                                    signatures.add(sig);
                                } catch (IOException e) {
                                    log.error("Error reading signature file: " + path, e);
                                }
                            });
        }

        return signatures;
    }

    private boolean isImageFile(Path path) {
        String fileName = path.getFileName().toString().toLowerCase();
        return fileName.endsWith(".jpg") || fileName.endsWith(".jpeg") || fileName.endsWith(".png");
    }

    private void validateFileName(String fileName) {
        if (fileName.contains("..") || fileName.contains("/") || fileName.contains("\\")) {
            throw new IllegalArgumentException("Invalid filename");
        }
        if (!fileName.matches("^[a-zA-Z0-9_.-]+$")) {
            throw new IllegalArgumentException("Filename contains invalid characters");
        }
    }

    private String validateAndNormalizeExtension(String extension) {
        String normalized = extension.toLowerCase().trim();
        if (normalized.equals("png") || normalized.equals("jpg") || normalized.equals("jpeg")) {
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
}
