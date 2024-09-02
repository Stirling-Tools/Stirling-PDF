package stirling.software.SPDF.controller.api.pipeline;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.utils.FileMonitor;

@Service
public class PipelineDirectoryProcessor {

    private static final Logger logger = LoggerFactory.getLogger(PipelineDirectoryProcessor.class);
    @Autowired private ObjectMapper objectMapper;
    @Autowired private ApiDocService apiDocService;
    @Autowired PipelineProcessor processor;
    @Autowired FileMonitor fileMonitor;

    final String watchedFoldersDir;
    final String finishedFoldersDir;

    public PipelineDirectoryProcessor(
            @Qualifier("watchedFoldersDir") String watchedFoldersDir,
            @Qualifier("finishedFoldersDir") String finishedFoldersDir) {
        this.watchedFoldersDir = watchedFoldersDir;
        this.finishedFoldersDir = finishedFoldersDir;
    }

    @Scheduled(fixedRate = 60000)
    public void scanFolders() {
        Path watchedFolderPath = Paths.get(watchedFoldersDir);
        if (!Files.exists(watchedFolderPath)) {
            try {
                Files.createDirectories(watchedFolderPath);
                logger.info("Created directory: {}", watchedFolderPath);
            } catch (IOException e) {
                logger.error("Error creating directory: {}", watchedFolderPath, e);
                return;
            }
        }
        try (Stream<Path> paths = Files.walk(watchedFolderPath)) {
            paths.filter(Files::isDirectory)
                    .forEach(
                            t -> {
                                try {
                                    if (!t.equals(watchedFolderPath) && !t.endsWith("processing")) {
                                        handleDirectory(t);
                                    }
                                } catch (Exception e) {
                                    logger.error("Error handling directory: {}", t, e);
                                }
                            });
        } catch (Exception e) {
            logger.error("Error walking through directory: {}", watchedFolderPath, e);
        }
    }

    public void handleDirectory(Path dir) throws IOException {
        logger.info("Handling directory: {}", dir);
        Path processingDir = createProcessingDirectory(dir);

        Optional<Path> jsonFileOptional = findJsonFile(dir);
        if (!jsonFileOptional.isPresent()) {
            logger.warn("No .JSON settings file found. No processing will happen for dir {}.", dir);
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
            logger.info("Created processing directory: {}", processingDir);
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
        logger.debug("Reading JSON file: {}", jsonFile);
        return objectMapper.readValue(jsonString, PipelineConfig.class);
    }

    private void processPipelineOperations(
            Path dir, Path processingDir, Path jsonFile, PipelineConfig config) throws IOException {
        for (PipelineOperation operation : config.getOperations()) {
            validateOperation(operation);
            File[] files = collectFilesForProcessing(dir, jsonFile, operation);
            if (files == null || files.length == 0) {
                logger.debug("No files detected for {} ", dir);
                return;
            }
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
        try (Stream<Path> paths = Files.list(dir)) {
            if ("automated".equals(operation.getParameters().get("fileInput"))) {
                return paths.filter(
                                path ->
                                        !Files.isDirectory(path)
                                                && !path.equals(jsonFile)
                                                && fileMonitor.isFileReadyForProcessing(path))
                        .map(Path::toFile)
                        .toArray(File[]::new);
            } else {
                String fileInput = (String) operation.getParameters().get("fileInput");
                return new File[] {new File(fileInput)};
            }
        }
    }

    private List<File> prepareFilesForProcessing(File[] files, Path processingDir)
            throws IOException {
        List<File> filesToProcess = new ArrayList<>();
        for (File file : files) {
            Path targetPath = resolveUniqueFilePath(processingDir, file.getName());
            Files.move(file.toPath(), targetPath);
            filesToProcess.add(targetPath.toFile());
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
            if (inputFiles == null || inputFiles.size() == 0) {
                return;
            }
            List<Resource> outputFiles = processor.runPipelineAgainstFiles(inputFiles, config);
            if (outputFiles == null) return;
            moveAndRenameFiles(outputFiles, config, dir);
            deleteOriginalFiles(filesToProcess, processingDir);
        } catch (Exception e) {
            logger.error("error during processing", e);
            moveFilesBack(filesToProcess, processingDir);
        }
    }

    private void moveAndRenameFiles(List<Resource> resources, PipelineConfig config, Path dir)
            throws IOException {
        for (Resource resource : resources) {
            String outputFileName = createOutputFileName(resource, config);
            Path outputPath = determineOutputPath(config, dir);

            if (!Files.exists(outputPath)) {
                Files.createDirectories(outputPath);
                logger.info("Created directory: {}", outputPath);
            }

            Path outputFile = outputPath.resolve(outputFileName);
            try (OutputStream os = new FileOutputStream(outputFile.toFile())) {
                os.write(((ByteArrayResource) resource).getByteArray());
            }

            logger.info("File moved and renamed to {}", outputFile);
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
            logger.info("Deleted original file: {}", file.getName());
        }
    }

    private void moveFilesBack(List<File> filesToProcess, Path processingDir) {
        for (File file : filesToProcess) {
            try {
                Files.move(processingDir.resolve(file.getName()), file.toPath());
                logger.info(
                        "Moved file back to original location: {} , {}",
                        file.toPath(),
                        file.getName());
            } catch (IOException e) {
                logger.error("Error moving file back to original location: {}", file.getName(), e);
            }
        }
    }
}
