package stirling.software.SPDF.controller.api.pipeline;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileSystemException;
import java.nio.file.FileVisitOption;
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
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.io.Resource;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineEvent;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.model.PipelineResult;
import stirling.software.SPDF.model.SessionConfig;
import stirling.software.SPDF.service.ApiDocService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.service.PostHogService;
import stirling.software.common.util.FileMonitor;

import tools.jackson.databind.ObjectMapper;

@Service
@Slf4j
public class PipelineDirectoryProcessor {

    private static final int MAX_DIRECTORY_DEPTH = 50; // Prevent excessive recursion
    private static final Pattern WATCHED_FOLDERS_PATTERN = Pattern.compile("\\\\?watchedFolders");

    private final ObjectMapper objectMapper;
    private final ApiDocService apiDocService;
    private final PipelineProcessor processor;
    private final FileMonitor fileMonitor;
    private final PostHogService postHogService;
    private final ApplicationEventPublisher eventPublisher;
    private final List<String> watchedFoldersDirs;
    private final String finishedFoldersDir;

    // Track processed directories in current scan to prevent duplicates
    private final ThreadLocal<java.util.Set<Path>> processedDirsInScan =
            ThreadLocal.withInitial(java.util.HashSet::new);

    public PipelineDirectoryProcessor(
            ObjectMapper objectMapper,
            ApiDocService apiDocService,
            PipelineProcessor processor,
            FileMonitor fileMonitor,
            PostHogService postHogService,
            ApplicationEventPublisher eventPublisher,
            RuntimePathConfig runtimePathConfig) {
        this.objectMapper = objectMapper;
        this.apiDocService = apiDocService;
        this.processor = processor;
        this.fileMonitor = fileMonitor;
        this.postHogService = postHogService;
        this.eventPublisher = eventPublisher;
        this.watchedFoldersDirs = runtimePathConfig.getPipelineWatchedFoldersPaths();
        this.finishedFoldersDir = runtimePathConfig.getPipelineFinishedFoldersPath();
    }

    @Scheduled(fixedRate = 60000)
    public void scanFolders() {
        // Clear the processed directories set for this scan cycle
        processedDirsInScan.get().clear();

        try {
            for (String watchedFoldersDir : watchedFoldersDirs) {
                scanWatchedFolder(Paths.get(watchedFoldersDir).toAbsolutePath());
            }
        } finally {
            // Clean up ThreadLocal to prevent memory leaks
            processedDirsInScan.remove();
        }
    }

    /**
     * Process a specific server-managed watch folder immediately. Called from the trigger endpoint
     * after the frontend uploads a file, so the folder doesn't have to wait for the 60s scan.
     * Initialises the processedDirsInScan ThreadLocal for this one-shot call.
     */
    public void processNow(Path dir) {
        processedDirsInScan.get().clear();
        try {
            handleDirectory(dir.toAbsolutePath().normalize());
        } catch (IOException e) {
            log.error("Error processing directory: {}", dir, e);
        } finally {
            processedDirsInScan.remove();
        }
    }

    private void scanWatchedFolder(Path watchedFolderPath) {
        if (!Files.exists(watchedFolderPath)) {
            try {
                Files.createDirectories(watchedFolderPath);
                log.info("Created directory: {}", watchedFolderPath);
            } catch (IOException e) {
                log.error("Error creating directory: {}", watchedFolderPath, e);
                return;
            }
        }

        // Validate the path is a directory and readable
        if (!Files.isDirectory(watchedFolderPath)) {
            log.error("Path is not a directory: {}", watchedFolderPath);
            return;
        }
        if (!Files.isReadable(watchedFolderPath)) {
            log.error("Directory is not readable: {}", watchedFolderPath);
            return;
        }

        try {
            // Use FOLLOW_LINKS to follow symlinks, with max depth to prevent infinite loops
            Files.walkFileTree(
                    watchedFolderPath,
                    EnumSet.of(FileVisitOption.FOLLOW_LINKS),
                    MAX_DIRECTORY_DEPTH,
                    new SimpleFileVisitor<>() {
                        @Override
                        public FileVisitResult preVisitDirectory(
                                Path dir, BasicFileAttributes attrs) {
                            try {
                                String dirName =
                                        dir.getFileName() != null
                                                ? dir.getFileName().toString()
                                                : "";
                                // Skip root directory and known subdirectories
                                if (!dir.equals(watchedFolderPath)
                                        && !"processing".equals(dirName)
                                        && !"processed".equals(dirName)
                                        && !"error".equals(dirName)) {
                                    // Skip server-managed folders — they are processed on-demand via
                                    // the trigger endpoint; session.json marks them as managed.
                                    if (Files.exists(dir.resolve("session.json"))) {
                                        return FileVisitResult.SKIP_SUBTREE;
                                    }
                                    handleDirectory(dir);
                                }
                            } catch (Exception e) {
                                log.error("Error handling directory: {}", dir, e);
                            }
                            return FileVisitResult.CONTINUE;
                        }

                        @Override
                        public FileVisitResult visitFileFailed(Path path, IOException exc) {
                            // Handle broken symlinks, permission issues, or inaccessible
                            // directories
                            if (exc != null) {
                                log.debug("Cannot access path '{}': {}", path, exc.getMessage());
                            }
                            return FileVisitResult.CONTINUE;
                        }
                    });
        } catch (IOException e) {
            log.error("Error walking through directory: {}", watchedFolderPath, e);
        }
    }

    public void handleDirectory(Path dir) throws IOException {
        // Normalize path to absolute to prevent duplicate processing from different path
        // representations
        Path normalizedDir = dir.toAbsolutePath().normalize();

        // Check if we've already processed this directory in this scan cycle
        java.util.Set<Path> processedDirs = processedDirsInScan.get();
        if (!processedDirs.add(normalizedDir)) {
            log.debug("Directory already processed in this scan cycle: {}", normalizedDir);
            return;
        }

        log.info("Handling directory: {}", dir);
        Path processingDir = createProcessingDirectory(dir);
        Optional<Path> jsonFileOptional = findJsonFile(dir);
        if (jsonFileOptional.isEmpty()) {
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
        // Prefer pipeline.json (server-managed folders); fall back to any .json (legacy folders)
        Path pipelineJson = dir.resolve("pipeline.json");
        if (Files.exists(pipelineJson)) return Optional.of(pipelineJson);
        try (Stream<Path> paths = Files.list(dir)) {
            return paths.filter(
                            file ->
                                    file.toString().endsWith(".json")
                                            && !file.getFileName()
                                                    .toString()
                                                    .equals("session.json"))
                    .findFirst();
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
            if (files.length == 0) {
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
            try (PipelineResult result =
                    runPipelineAgainstFiles(filesToProcess, config, dir, processingDir)) {}
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
        // Server-managed folders (session.json present) only process files that have a
        // corresponding .ready marker, preventing partial-upload races.
        boolean isServerManaged = Files.exists(dir.resolve("session.json"));

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
                                        String fname = path.getFileName().toString();
                                        // Skip session.json (SSE routing metadata, not a PDF)
                                        if (fname.equals("session.json")) {
                                            return false;
                                        }
                                        // Skip .ready marker files themselves
                                        if (fname.endsWith(".ready")) {
                                            return false;
                                        }
                                        // For server-managed folders, require a .ready marker
                                        if (isServerManaged) {
                                            int dot = fname.lastIndexOf('.');
                                            String stem = dot > 0 ? fname.substring(0, dot) : fname;
                                            if (!Files.exists(dir.resolve(stem + ".ready"))) {
                                                log.debug(
                                                        "Skipping {} — no .ready marker (upload may be in progress)",
                                                        fname);
                                                return false;
                                            }
                                        }

                                        // Check against allowed extensions
                                        String extension =
                                                fname.contains(".")
                                                        ? fname.substring(fname.lastIndexOf('.') + 1)
                                                                .toLowerCase(Locale.ROOT)
                                                        : "";
                                        boolean isAllowed =
                                                allowAllFiles
                                                        || inputExtensions.contains(extension);
                                        if (!isAllowed) {
                                            log.info(
                                                    "Skipping file with unsupported extension: {}"
                                                            + " ({})",
                                                    fname,
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
                                                    "File not ready for processing (locked/created"
                                                            + " last 5s): {}",
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
                // Remove the .ready marker now that the file is safely in processingDir
                String stem = file.getName().contains(".")
                        ? file.getName().substring(0, file.getName().lastIndexOf('.'))
                        : file.getName();
                try {
                    Files.deleteIfExists(file.toPath().getParent().resolve(stem + ".ready"));
                } catch (IOException ignore) {
                    // Best-effort — marker absence is benign
                }
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

    private PipelineResult runPipelineAgainstFiles(
            List<File> filesToProcess, PipelineConfig config, Path dir, Path processingDir)
            throws IOException {
        try {
            List<Resource> inputFiles =
                    processor.generateInputFiles(filesToProcess.toArray(new File[0]));
            if (inputFiles == null || inputFiles.isEmpty()) {
                return new PipelineResult();
            }
            PipelineResult result = processor.runPipelineAgainstFiles(inputFiles, config);

            if (result.isHasErrors()) {
                log.error("Errors occurred during processing, retaining original files");
                moveToErrorDirectory(filesToProcess, dir);
                notifySSEError(dir, filesToProcess);
            } else {
                List<String> outputFilenames =
                        moveAndRenameFiles(result.getOutputFiles(), config, dir);
                deleteOriginalFiles(filesToProcess, processingDir);
                notifySSECompletion(dir, outputFilenames);
            }
            return result;
        } catch (Exception e) {
            log.error("Error during processing", e);
            moveFilesBack(filesToProcess, processingDir);
            return new PipelineResult();
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

    private List<String> moveAndRenameFiles(
            List<Resource> resources, PipelineConfig config, Path dir) throws IOException {
        List<String> outputFilenames = new ArrayList<>();
        for (Resource resource : resources) {
            String outputFileName = createOutputFileName(resource, config);
            Path outputPath = determineOutputPath(config, dir);
            if (!Files.exists(outputPath)) {
                Files.createDirectories(outputPath);
                log.info("Created directory: {}", outputPath);
            }
            Path outputFile = outputPath.resolve(outputFileName);
            try (OutputStream os = new FileOutputStream(outputFile.toFile());
                    InputStream is = resource.getInputStream()) {
                is.transferTo(os);
            }
            log.info("File moved and renamed to {}", outputFile);
            outputFilenames.add(outputFileName);
        }
        return outputFilenames;
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
                WATCHED_FOLDERS_PATTERN
                        .matcher(
                                config.getOutputDir()
                                        .replace("{outputFolder}", finishedFoldersDir)
                                        .replace("{folderName}", dir.toString()))
                        .replaceAll("");
        return Paths.get(outputDir).isAbsolute() ? Paths.get(outputDir) : Paths.get(".", outputDir);
    }

    private void deleteOriginalFiles(List<File> filesToProcess, Path processingDir)
            throws IOException {
        for (File file : filesToProcess) {
            Files.deleteIfExists(processingDir.resolve(file.getName()));
            log.info("Deleted original file: {}", file.getName());
        }
    }

    /**
     * If the watch folder contains a session.json (written by {@link ServerFolderService}), push a
     * {@code server-folder-complete} SSE event so the frontend can download the outputs.
     *
     * <p>Output filenames have the form {@code {fileId}.{ext}} so the frontend can recover the IDB
     * fileId by stripping the extension — no name-based lookup is needed.
     */
    private void notifySSECompletion(Path dir, List<String> outputFilenames) {
        Path sessionFile = dir.resolve("session.json");
        if (!Files.exists(sessionFile)) return;
        try {
            SessionConfig session =
                    objectMapper.readValue(sessionFile.toFile(), SessionConfig.class);
            String sessionId = session.sessionId();
            String folderId = session.folderId();
            if (sessionId == null || sessionId.isBlank()) return;

            eventPublisher.publishEvent(
                    new PipelineEvent.FolderCompleted(
                            sessionId, folderId != null ? folderId : "", outputFilenames));
        } catch (Exception e) {
            log.warn("Failed to push SSE completion for folder {}: {}", dir, e.getMessage());
        }
    }

    /**
     * If the watch folder contains a session.json, push a {@code server-folder-error} SSE event so
     * the frontend can mark the affected files as failed. The fileId is encoded as the basename of
     * each input filename ({@code {fileId}.{ext}}).
     */
    private void notifySSEError(Path dir, List<File> failedFiles) {
        Path sessionFile = dir.resolve("session.json");
        if (!Files.exists(sessionFile)) return;
        try {
            SessionConfig session =
                    objectMapper.readValue(sessionFile.toFile(), SessionConfig.class);
            String sessionId = session.sessionId();
            String folderId = session.folderId();
            if (sessionId == null || sessionId.isBlank()) return;

            List<String> failedFileIds =
                    failedFiles.stream()
                            .map(
                                    f -> {
                                        String name = f.getName();
                                        int dot = name.lastIndexOf('.');
                                        return dot > 0 ? name.substring(0, dot) : name;
                                    })
                            .toList();

            eventPublisher.publishEvent(
                    new PipelineEvent.FolderError(
                            sessionId, folderId != null ? folderId : "", failedFileIds));
        } catch (Exception e) {
            log.warn("Failed to push SSE error for folder {}: {}", dir, e.getMessage());
        }
    }

    private void moveFilesBack(List<File> filesToProcess, Path processingDir) {
        Path folderRoot = processingDir.getParent();
        for (File file : filesToProcess) {
            try {
                Path target = folderRoot.resolve(file.getName());
                Files.move(file.toPath(), target, StandardCopyOption.REPLACE_EXISTING);
                log.info("Moved file back to folder root for retry: {}", target);
            } catch (IOException e) {
                log.error("Error moving file back to folder root: {}", file.getName(), e);
            }
        }
    }
}
