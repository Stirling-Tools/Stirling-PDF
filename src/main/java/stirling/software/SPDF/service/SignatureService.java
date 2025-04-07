package stirling.software.SPDF.service;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.thymeleaf.util.StringUtils;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.InstallationPathConfig;
import stirling.software.SPDF.model.SignatureFile;

@Service
@Slf4j
public class SignatureService {

    private final String SIGNATURE_BASE_PATH;
    private final String ALL_USERS_FOLDER = "ALL_USERS";

    public SignatureService() {
        SIGNATURE_BASE_PATH = InstallationPathConfig.getSignaturesPath();
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
        if (!StringUtils.isEmptyOrWhitespace(username)) {
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
        return Files.list(folder)
                .filter(path -> isImageFile(path))
                .map(path -> new SignatureFile(path.getFileName().toString(), category))
                .toList();
    }

    public byte[] getSignatureBytes(String username, String fileName) throws IOException {
        validateFileName(fileName);
        // First try user's personal folder
        Path userPath = Paths.get(SIGNATURE_BASE_PATH, username, fileName);
        if (Files.exists(userPath)) {
            return Files.readAllBytes(userPath);
        }

        // Then try ALL_USERS folder
        Path allUsersPath = Paths.get(SIGNATURE_BASE_PATH, ALL_USERS_FOLDER, fileName);
        if (Files.exists(allUsersPath)) {
            return Files.readAllBytes(allUsersPath);
        }

        throw new FileNotFoundException("Signature file not found");
    }

    private boolean isImageFile(Path path) {
        String fileName = path.getFileName().toString().toLowerCase();
        return fileName.endsWith(".jpg")
                || fileName.endsWith(".jpeg")
                || fileName.endsWith(".png")
                || fileName.endsWith(".gif");
    }

    private void validateFileName(String fileName) {
        if (fileName.contains("..") || fileName.contains("/") || fileName.contains("\\")) {
            throw new IllegalArgumentException("Invalid filename");
        }
    }
}
