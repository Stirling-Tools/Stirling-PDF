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
    
    @Value("${template.integrity.enabled:true}")
    private boolean integrityCheckEnabled;

    public TemplateIntegrityConfig(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    @Bean
    public boolean templatesModified() {
        if (!integrityCheckEnabled) {
            logger.info("Template integrity checking is disabled");
            return false;
        }
        
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
    
    private void logReferenceHashes(Map<String, String> hashes) {
        logger.info("Loaded {} reference hashes", hashes.size());
        
        // Log a few example files for debugging
        logger.info("Sample of reference hashes:");
        hashes.entrySet().stream()
              .limit(5)
              .forEach(e -> logger.info(" - {}: {}", e.getKey(), e.getValue()));
        
        // Also log sample PDF files if any
        hashes.entrySet().stream()
              .filter(e -> e.getKey().endsWith(".pdf"))
              .limit(3)
              .forEach(e -> logger.info(" - PDF file: {}: {}", e.getKey(), e.getValue()));
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
        logger.debug("Loaded {} reference hashes", result.size());
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
                    // Walk the directory tree - process ALL files, not just text files
                    Files.walk(directory)
                        .filter(Files::isRegularFile)
                        .forEach(path -> {
                            if (modified.get()) return; // Skip if already found modification
                            
                            try {
                                String basePath = dirPath.replace("/", "");
                                String relativePath = basePath + "/" + directory.relativize(path).toString().replace("\\", "/");
                                
                                // Debug log the path normalization
                                logger.debug("Processing file: {} -> {}", path, relativePath);
                                
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
                                
                                // Log hash comparison for debugging
                                logger.info("Hash comparison for {}: reference={}, current={}", 
                                             relativePath, referenceHash, currentHash);
                                
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
                    // File was in reference but not found - report ALL missing files
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
            return computeNormalizedTextFileHash(filePath);
        } else {
            // Binary files use direct CRC32
            return computeBinaryFileHash(filePath);
        }
    }
    
    private String computeNormalizedTextFileHash(Path filePath) throws IOException {
        byte[] content = Files.readAllBytes(filePath);
        String text = new String(content, StandardCharsets.UTF_8);
        
        // Remove ALL carriage returns to match GitHub workflow's tr -d '\r'
        text = text.replace("\r", "");
        
        byte[] normalizedBytes = text.getBytes(StandardCharsets.UTF_8);
        
        CRC32 checksum = new CRC32();
        checksum.update(normalizedBytes, 0, normalizedBytes.length);
        return String.valueOf(checksum.getValue());
    }
    
    private String computeBinaryFileHash(Path filePath) throws IOException {
        byte[] content = Files.readAllBytes(filePath);
        
        CRC32 checksum = new CRC32();
        checksum.update(content, 0, content.length);
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