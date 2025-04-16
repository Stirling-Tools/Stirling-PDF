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
import java.nio.charset.StandardCharsets;
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
    
    @Value("${template.normalize.line.endings:true}")
    private boolean normalizeLineEndings;

    public TemplateIntegrityConfig(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    @Bean
    public boolean templatesModified() {
        try {
            // Log configuration information
            logConfiguration();
            
            Map<String, String> referenceHashes = loadReferenceHashes();
            
            // Check for modifications with early termination
            if (checkForModifications(referenceHashes)) {
                logger.warn("SECURITY WARNING: Templates appear to have been modified from the release version!");
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
    
    private void logConfiguration() {
        logger.info("Template integrity check starting with configuration:");
        logger.info(" - Reference hash path: {}", referenceHashPath);
        logger.info(" - Template directories: {}", String.join(", ", templateDirectories));
        logger.info(" - Line ending normalization: {}", normalizeLineEndings ? "enabled" : "disabled");
    }

    private Map<String, String> loadReferenceHashes() throws IOException {
        Resource resource = resourceLoader.getResource(referenceHashPath);
        try (InputStream is = resource.getInputStream()) {
            String content = new String(is.readAllBytes());
            Map<String, String> hashes = parseHashJson(content);
            logReferenceHashes(hashes);
            return hashes;
        }
    }
    
    private void logHashComparison(String relativePath, String referenceHash, String currentHash) {
        logger.info("Hash comparison for {}: reference={}, current={}", 
                     relativePath, referenceHash, currentHash);
        
        // Try to convert between formats to see if that's the issue
        try {
            // If currentHash is hex, convert to decimal
            if (currentHash.matches("[0-9a-fA-F]+") && !currentHash.matches("[0-9]+")) {
                long decimalValue = Long.parseLong(currentHash, 16);
                logger.info("Converting current hex hash to decimal: {} -> {}", 
                             currentHash, decimalValue);
                
                // Check if the decimal conversion matches the reference
                if (String.valueOf(decimalValue).equals(referenceHash)) {
                    logger.warn("Hash format mismatch detected! Current hash is in hex format but reference is decimal.");
                }
            }
            
            // If referenceHash could be decimal but currentHash is decimal too
            // Check if reference could be hex
            if (referenceHash.matches("[0-9]+") && currentHash.matches("[0-9]+")) {
                // Try treating reference as hex and converting to decimal
                try {
                    long hexAsDecimal = Long.parseLong(referenceHash, 16);
                    if (String.valueOf(hexAsDecimal).equals(currentHash)) {
                        logger.warn("Reference hash might be incorrectly interpreted as decimal when it's hex!");
                    }
                } catch (NumberFormatException e) {
                    // Not a valid hex number, which is fine
                }
            }
        } catch (Exception e) {
            logger.info("Error during hash format conversion check", e);
        }
    }
    
    private void logReferenceHashes(Map<String, String> hashes) {
        logger.info("Loaded {} reference hashes", hashes.size());
        
        // Log a few example HTML files for infoging
        logger.info("Sample of reference hashes:");
        hashes.entrySet().stream()
              .filter(e -> e.getKey().endsWith(".html"))
              .limit(5)
              .forEach(e -> logger.info(" - {}: {}", e.getKey(), e.getValue()));
    }
    
    private Map<String, String> parseHashJson(String json) {
        Map<String, String> result = new HashMap<>();
        // Simple JSON parsing to avoid additional dependencies
        // Remove all whitespace first to make parsing more robust
        json = json.replaceAll("\\s+", "");
        String[] entries = json.replaceAll("[{}\"]", "").split(",");
        for (String entry : entries) {
            if (entry.isEmpty()) continue;
            String[] parts = entry.split(":");
            if (parts.length == 2) {
                result.put(parts[0], parts[1]);
            }
        }
        logger.info("Loaded {} reference hashes", result.size());
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
                                String basePath = dirPath.replace("/", "");
                                String relativePath = basePath + "/" + directory.relativize(path).toString().replace("\\", "/");
                                
                                // info log the path normalization
                                logger.info("Processing file: {} -> {}", path, relativePath);
                                
                                // Check if this file is in our reference
                                String referenceHash = referenceHashes.get(relativePath);
                                if (referenceHash == null) {
                                    // Try with different path format
                                    relativePath = directory.relativize(path).toString().replace("\\", "/");
                                    referenceHash = referenceHashes.get(relativePath);
                                    
                                    if (referenceHash == null) {
                                        // New file found
                                        String currentHash = computeFileHash(path);
                                        logger.warn("New file detected: {} (calculated hash: {})", 
                                                   relativePath, currentHash);
                                        modified.set(true);
                                        return;
                                    }
                                }
                                
                                // Track that we found this file
                                foundFiles.put(relativePath, true);
                                
                                // Check if the hash matches
                                String currentHash = computeFileHash(path);
                                
                                logger.info("Hash comparison for {}: reference={}, current={}", 
                                             relativePath, referenceHash, currentHash);
                                logHashComparison(relativePath, referenceHash, currentHash);
                                if (!currentHash.equals(referenceHash)) {
                                    logger.warn("Modified file detected: {} (expected hash: {}, actual hash: {})", 
                                               relativePath, referenceHash, currentHash);
                                    modified.set(true);
                                }
                            } catch (IOException e) {
                                logger.warn("Failed to hash file: {}", path, e);
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
                    logger.warn("Missing file detected: {} (expected hash: {})", 
                              entry.getKey(), referenceHashes.get(entry.getKey()));
                    return true;
                }
            }
        }
        
        return modified.get();
    }
    
    private String computeFileHash(Path filePath) throws IOException {
        // For text files like HTML, normalize content before hashing
        String extension = getFileExtension(filePath.toString()).toLowerCase();
        if (normalizeLineEndings && isTextFile(extension)) {
            return computeNormalizedTextFileHash(filePath, extension);
        } else {
            // Binary files use direct CRC32
            return computeBinaryFileHash(filePath);
        }
    }
    

private String computeNormalizedTextFileHash(Path filePath, String extension) throws IOException {
    byte[] content = Files.readAllBytes(filePath);
    String text = new String(content, StandardCharsets.UTF_8);
    
    // Normalize line endings to LF
    text = text.replace("\r\n", "\n");
    
    // Additional HTML-specific normalization if needed
    if (extension.equals("html") || extension.equals("htm")) {
        // Optional: normalize whitespace between HTML tags
        // text = text.replaceAll(">\\s+<", "><");
    }
    
    byte[] normalizedBytes = text.getBytes(StandardCharsets.UTF_8);
    
    Checksum checksum = new CRC32();
    checksum.update(normalizedBytes, 0, normalizedBytes.length);
    // Return decimal representation to match GitHub workflow
    return String.valueOf(checksum.getValue());
}

    
private String computeBinaryFileHash(Path filePath) throws IOException {
    Checksum checksum = new CRC32();
    
    try (InputStream is = Files.newInputStream(filePath)) {
        byte[] buffer = new byte[BUFFER_SIZE];
        int bytesRead;
        while ((bytesRead = is.read(buffer)) != -1) {
            checksum.update(buffer, 0, bytesRead);
        }
    }
    
    // Return decimal representation to match GitHub workflow
    return String.valueOf(checksum.getValue());
}
    private String getFileExtension(String filename) {
        int lastDot = filename.lastIndexOf('.');
        if (lastDot == -1 || lastDot == filename.length() - 1) {
            return "";
        }
        return filename.substring(lastDot + 1);
    }
    
    private boolean isTextFile(String extension) {
        // List of common text file extensions
        return extension.equals("html") || extension.equals("htm") || 
               extension.equals("css") || extension.equals("js") ||
               extension.equals("txt") || extension.equals("md") ||
               extension.equals("xml") || extension.equals("json") ||
               extension.equals("csv") || extension.equals("properties");
    }

}