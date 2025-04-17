package stirling.software.SPDF.controller.api.pipeline;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileSystemException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.RuntimePathConfig;
import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.model.PipelineResult;
import stirling.software.SPDF.service.PostHogService;
import stirling.software.SPDF.utils.FileMonitor;

@Service
@Slf4j
public class PipelineDirectoryProcessor {

    private final ObjectMapper objectMapper;
    private final ApiDocService apiDocService;
    private final PipelineProcessor processor;
    private final FileMonitor fileMonitor;
    private final PostHogService postHogService;
    private final String watchedFoldersDir;
    private final String finishedFoldersDir;

    public PipelineDirectoryProcessor(
            ObjectMapper objectMapper,
            ApiDocService apiDocService,
            PipelineProcessor processor,
            FileMonitor fileMonitor,
            PostHogService postHogService,
            RuntimePathConfig runtimePathConfig) {
        this.objectMapper = objectMapper;
        this.apiDocService = apiDocService;
        this.processor = processor;
        this.fileMonitor = fileMonitor;
        this.postHogService = postHogService;
        this.watchedFoldersDir = runtimePathConfig.getPipelineWatchedFoldersPath();
        this.finishedFoldersDir = runtimePathConfig.getPipelineFinishedFoldersPath();
    }

    @Scheduled(fixedRate = 60000)
    public void scanFolders() {
        Path watchedFolderPath = Paths.get(watchedFoldersDir).toAbsolutePath();
        if (!Files.exists(watchedFolderPath)) {
            try {
                Files.createDirectories(watchedFolderPath);
                log.info("Created directory: {}", watchedFolderPath);
            } catch (IOException e) {
                log.error("Error creating directory: {}", watchedFolderPath, e);
                return;
            }
        }

        try {
            Files.walkFileTree(
                    watchedFolderPath,
                    new SimpleFileVisitor<>() {
                        @Override
                        public FileVisitResult preVisitDirectory(
                                Path dir, BasicFileAttributes attrs) {
                            try {
                                // Skip root directory and "processing" subdirectories
                                if (!dir.equals(watchedFolderPath) && !dir.endsWith("processing")) {
                                    handleDirectory(dir);
                                }
                            } catch (Exception e) {
                                log.error("Error handling directory: {}", dir, e);
                            }
                            return FileVisitResult.CONTINUE;
                        }

                        @Override
                        public FileVisitResult visitFileFailed(Path path, IOException exc) {
                            // Handle broken symlinks or inaccessible directories
                            log.error("Error accessing path: {}", path, exc);
                            return FileVisitResult.CONTINUE;
                        }
                    });
        } catch (IOException e) {
            log.error("Error walking through directory: {}", watchedFolderPath, e);
        }
    }

    public void handleDirectory(Path dir) throws IOException {
        log.info("Handling directory: {}", dir);
        Path processingDir = createProcessingDirectory(dir);
        Optional<Path> jsonFileOptional = findJsonFile(dir);
        if (!jsonFileOptional.isPresent()) {
            log.warn("No .JSON settings file found. No processing will happen for dir {}.", dir);
            return;
        }
        Path jsonFile = jsonFileOptional.get();
        PipelineConfig config = readAndParseJson(jsonFile);
        processPipelineOperations(dir, processingDir, jsonFile, config);
    }

    private Path createProcessingDirectory(Path dir) throws IOException {
        Path processingDir = dir.resolve("processing");
        if (!Files.exists(processingDir)) {
            Files.createDirectory(processingDir);
            log.info("Created processing directory: {}", processingDir);
        }
        return processingDir;
    }

    private Optional<Path> findJsonFile(Path dir) throws IOException {
        try (Stream<Path> paths = Files.list(dir)) {
            return paths.filter(file -> file.toString().endsWith(".json")).findFirst();
        }
    }

    private PipelineConfig readAndParseJson(Path jsonFile) throws IOException {
        String jsonString = new String(Files.readAllBytes(jsonFile), StandardCharsets.UTF_8);
        log.debug("Reading JSON file: {}", jsonFile);
        return objectMapper.readValue(jsonString, PipelineConfig.class);
    }

    private void processPipelineOperations(
            Path dir, Path processingDir, Path jsonFile, PipelineConfig config) throws IOException {
        for (PipelineOperation operation : config.getOperations()) {
            validateOperation(operation);
            File[] files = collectFilesForProcessing(dir, jsonFile, operation);
            if (files == null || files.length == 0) {
                log.debug("No files detected for {} ", dir);
                return;
            }

            List<String> operationNames =
                    config.getOperations().stream().map(PipelineOperation::getOperation).toList();
            Map<String, Object> properties = new HashMap<>();
            properties.put("operations", operationNames);
            properties.put("fileCount", files.length);
            postHogService.captureEvent("pipeline_directory_event", properties);

            List<File> filesToProcess = prepareFilesForProcessing(files, processingDir);
            runPipelineAgainstFiles(filesToProcess, config, dir, processingDir);
        }
    }

    private void validateOperation(PipelineOperation operation) throws IOException {
        if (!apiDocService.isValidOperation(operation.getOperation(), operation.getParameters())) {
            throw new IOException("Invalid operation: " + operation.getOperation());
        }
    }

    private File[] collectFilesForProcessing(Path dir, Path jsonFile, PipelineOperation operation)
            throws IOException {

        List<String> inputExtensions =
                apiDocService.getExtensionTypes(false, operation.getOperation());
        log.info(
                "Allowed extensions for operation {}: {}",
                operation.getOperation(),
                inputExtensions);

        boolean allowAllFiles = inputExtensions.contains("ALL");

        try (Stream<Path> paths = Files.list(dir)) {
            File[] files =
                    paths.filter(
                                    path -> {
                                        if (Files.isDirectory(path)) {
                                            return false;
                                        }
                                        if (path.equals(jsonFile)) {
                                            return false;
                                        }

                                        // Get file extension
                                        String filename = path.getFileName().toString();
                                        String extension =
                                                filename.contains(".")
                                                        ? filename.substring(
                                                                        filename.lastIndexOf(".")
                                                                                + 1)
                                                                .toLowerCase()
                                                        : "";

                                        // Check against allowed extensions
                                        boolean isAllowed =
                                                allowAllFiles
                                                        || inputExtensions.contains(
                                                                extension.toLowerCase());
                                        if (!isAllowed) {
                                            log.info(
                                                    "Skipping file with unsupported extension: {} ({})",
                                                    filename,
                                                    extension);
                                        }
                                        return isAllowed;
                                    })
                            .map(Path::toAbsolutePath)
                            .filter(
                                    path -> {
                                        boolean isReady =
                                                fileMonitor.isFileReadyForProcessing(path);
                                        if (!isReady) {
                                            log.info(
                                                    "File not ready for processing (locked/created last 5s): {}",
                                                    path);
                                        }
                                        return isReady;
                                    })
                            .map(Path::toFile)
                            .toArray(File[]::new);
            log.info(
                    "Collected {} files for processing for {}",
                    files.length,
                    dir.toAbsolutePath().toString());
            return files;
        }
    }

    private List<File> prepareFilesForProcessing(File[] files, Path processingDir)
            throws IOException {
        List<File> filesToProcess = new ArrayList<>();
        for (File file : files) {
            Path targetPath = resolveUniqueFilePath(processingDir, file.getName());

            // Retry with exponential backoff
            int maxRetries = 3;
            int retryDelayMs = 500;
            boolean moved = false;

            for (int attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    Files.move(file.toPath(), targetPath, StandardCopyOption.REPLACE_EXISTING);
                    moved = true;
                    break;
                } catch (FileSystemException e) {
                    if (attempt < maxRetries) {
                        log.info("File move failed (attempt {}), retrying...", attempt);
                        try {
                            Thread.sleep(retryDelayMs * (int) Math.pow(2, attempt - 1));
                        } catch (InterruptedException e1) {
                            log.error("prepareFilesForProcessing failure", e);
                        }
                    }
                }
            }

            if (moved) {
                filesToProcess.add(targetPath.toFile());
            } else {
                log.error("Failed to move file after {} attempts: {}", maxRetries, file.getName());
            }
        }
        return filesToProcess;
    }

    private Path resolveUniqueFilePath(Path directory, String originalFileName) {
        Path filePath = directory.resolve(originalFileName);
        int counter = 1;
        while (Files.exists(filePath)) {
            String newName = appendSuffixToFileName(originalFileName, "(" + counter + ")");
            filePath = directory.resolve(newName);
            counter++;
        }
        return filePath;
    }

    private String appendSuffixToFileName(String originalFileName, String suffix) {
        int dotIndex = originalFileName.lastIndexOf('.');
        if (dotIndex == -1) {
            return originalFileName + suffix;
        } else {
            return originalFileName.substring(0, dotIndex)
                    + suffix
                    + originalFileName.substring(dotIndex);
        }
    }

    private void runPipelineAgainstFiles(
            List<File> filesToProcess, PipelineConfig config, Path dir, Path processingDir)
            throws IOException {
        try {
            List<Resource> inputFiles =
                    processor.generateInputFiles(filesToProcess.toArray(new File[0]));
            if (inputFiles == null || inputFiles.isEmpty()) {
                return;
            }
            PipelineResult result = processor.runPipelineAgainstFiles(inputFiles, config);

            if (result.isHasErrors()) {
                log.error("Errors occurred during processing, retaining original files");
                moveToErrorDirectory(filesToProcess, dir);
            } else {
                moveAndRenameFiles(result.getOutputFiles(), config, dir);
                deleteOriginalFiles(filesToProcess, processingDir);
            }
        } catch (Exception e) {
            log.error("Error during processing", e);
            moveFilesBack(filesToProcess, processingDir);
        }
    }

    private void moveToErrorDirectory(List<File> files, Path originalDir) throws IOException {
        Path errorDir = originalDir.resolve("error");
        if (!Files.exists(errorDir)) {
            Files.createDirectories(errorDir);
        }

        for (File file : files) {
            Path target = errorDir.resolve(file.getName());
            Files.move(file.toPath(), target);
            log.info("Moved failed file to error directory for investigation: {}", target);
        }
    }

    private void moveAndRenameFiles(List<Resource> resources, PipelineConfig config, Path dir)
            throws IOException {
        for (Resource resource : resources) {
            String outputFileName = createOutputFileName(resource, config);
            Path outputPath = determineOutputPath(config, dir);
            if (!Files.exists(outputPath)) {
                Files.createDirectories(outputPath);
                log.info("Created directory: {}", outputPath);
            }
            Path outputFile = outputPath.resolve(outputFileName);
            try (OutputStream os = new FileOutputStream(outputFile.toFile())) {
                os.write(((ByteArrayResource) resource).getByteArray());
            }
            log.info("File moved and renamed to {}", outputFile);
        }
    }

    private String createOutputFileName(Resource resource, PipelineConfig config) {
        String resourceName = resource.getFilename();
        String baseName = resourceName.substring(0, resourceName.lastIndexOf('.'));
        String extension = resourceName.substring(resourceName.lastIndexOf('.') + 1);
        String outputFileName =
                config.getOutputPattern()
                                .replace("{filename}", baseName)
                                .replace("{pipelineName}", config.getName())
                                .replace(
                                        "{date}",
                                        LocalDate.now()
                                                .format(DateTimeFormatter.ofPattern("yyyyMMdd")))
                                .replace(
                                        "{time}",
                                        LocalTime.now()
                                                .format(DateTimeFormatter.ofPattern("HHmmss")))
                        + "."
                        + extension;
        return outputFileName;
    }

    private Path determineOutputPath(PipelineConfig config, Path dir) {
        String outputDir =
                config.getOutputDir()
                        .replace("{outputFolder}", finishedFoldersDir)
                        .replace("{folderName}", dir.toString())
                        .replaceAll("\\\\?watchedFolders", "");
        return Paths.get(outputDir).isAbsolute() ? Paths.get(outputDir) : Paths.get(".", outputDir);
    }

    private void deleteOriginalFiles(List<File> filesToProcess, Path processingDir)
            throws IOException {
        for (File file : filesToProcess) {
            Files.deleteIfExists(processingDir.resolve(file.getName()));
            log.info("Deleted original file: {}", file.getName());
        }
    }

    private void moveFilesBack(List<File> filesToProcess, Path processingDir) {
        for (File file : filesToProcess) {
            try {
                Files.move(processingDir.resolve(file.getName()), file.toPath());
                log.info(
                        "Moved file back to original location: {} , {}",
                        file.toPath(),
                        file.getName());
            } catch (IOException e) {
                log.error("Error moving file back to original location: {}", file.getName(), e);
            }
        }
    }
}
