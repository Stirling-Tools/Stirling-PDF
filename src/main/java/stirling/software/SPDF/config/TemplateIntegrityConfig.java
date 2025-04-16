package stirling.software.SPDF.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.CRC32;
import java.util.zip.Checksum;

@Configuration
public class TemplateIntegrityConfig {

    private static final Logger logger = LoggerFactory.getLogger(TemplateIntegrityConfig.class);
    
    // Buffer size for reading files (8KB is a good balance)
    private static final int BUFFER_SIZE = 8192;
    
    private final ResourceLoader resourceLoader;

    @Value("${template.hash.reference:classpath:reference-hash.json}")
    private String referenceHashPath;

    @Value("${template.directories:classpath:templates/,classpath:static/}")
    private String[] templateDirectories;

    public TemplateIntegrityConfig(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    @Bean
    public boolean templatesModified() {
        try {
            Map<String, String> referenceHashes = loadReferenceHashes();
            
            // Check for modifications with early termination
            if (checkForModifications(referenceHashes)) {
                logger.info("SECURITY WARNING: Templates appear to have been modified from the release version!");
                return true;
            }
            
            logger.info("Template integrity verified successfully");
            return false;
        } catch (Exception e) {
            logger.error("Error verifying template integrity", e);
            // In case of error, assume modified for security
            return true;
        }
    }

    private Map<String, String> loadReferenceHashes() throws IOException {
        Resource resource = resourceLoader.getResource(referenceHashPath);
        try (InputStream is = resource.getInputStream()) {
            String content = new String(is.readAllBytes());
            return parseHashJson(content);
        }
    }
    
    private Map<String, String> parseHashJson(String json) {
        Map<String, String> result = new HashMap<>();
        // Simple JSON parsing to avoid additional dependencies
        String[] entries = json.replaceAll("[{}\"]", "").split(",");
        for (String entry : entries) {
            String[] parts = entry.trim().split(":");
            if (parts.length == 2) {
                result.put(parts[0].trim(), parts[1].trim());
            }
        }
        return result;
    }

    private boolean checkForModifications(Map<String, String> referenceHashes) throws IOException {
        // Track files we've found to check for missing files later
        Map<String, Boolean> foundFiles = new HashMap<>();
        for (String key : referenceHashes.keySet()) {
            foundFiles.put(key, false);
        }
        
        AtomicBoolean modified = new AtomicBoolean(false);
        
        // Check each directory
        for (String dir : templateDirectories) {
            if (modified.get()) {
                break; // Early termination
            }
            
            // Remove classpath: prefix if present
            String dirPath = dir.replace("classpath:", "");
            
            // Get the resource as a file
            Resource resource = resourceLoader.getResource("classpath:" + dirPath);
            try {
                Path directory = Paths.get(resource.getURI());
                
                if (Files.exists(directory) && Files.isDirectory(directory)) {
                    // Walk the directory tree
                    Files.walk(directory)
                        .filter(Files::isRegularFile)
                        .forEach(path -> {
                            if (modified.get()) return; // Skip if already found modification
                            
                            try {
                                String relativePath = directory.relativize(path).toString();
                                // Track that we found this file
                                foundFiles.put(relativePath, true);
                                
                                // Check if this file is in our reference
                                String referenceHash = referenceHashes.get(relativePath);
                                if (referenceHash == null) {
                                    // New file found
                                    logger.info("New file detected: {}", relativePath);
                                    modified.set(true);
                                    return;
                                }
                                
                                // Check if the hash matches
                                String currentHash = computeFileHash(path);
                                if (!currentHash.equals(referenceHash)) {
                                    logger.info("Modified file detected: {}", relativePath);
                                    modified.set(true);
                                }
                            } catch (IOException e) {
                                logger.info("Failed to hash file: {}", path, e);
                                modified.set(true); // Fail safe
                            }
                        });
                }
            } catch (Exception e) {
                logger.error("Error accessing directory: {}", dirPath, e);
                return true; // Assume modified on error
            }
        }
        
        // If we haven't found a modification yet, check for missing files
        if (!modified.get()) {
            for (Map.Entry<String, Boolean> entry : foundFiles.entrySet()) {
                if (!entry.getValue()) {
                    // File was in reference but not found
                    logger.info("Missing file detected: {}", entry.getKey());
                    return true;
                }
            }
        }
        
        return modified.get();
    }
    
    private String computeFileHash(Path filePath) throws IOException {
        Checksum checksum = new CRC32(); // Much faster than MD5 or SHA
        
        try (InputStream is = Files.newInputStream(filePath)) {
            byte[] buffer = new byte[BUFFER_SIZE];
            int bytesRead;
            while ((bytesRead = is.read(buffer)) != -1) {
                checksum.update(buffer, 0, bytesRead);
            }
        }
        
        return Long.toHexString(checksum.getValue());
    }
}