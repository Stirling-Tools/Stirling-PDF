package stirling.software.SPDF.controller.api.pipeline;

import java.io.*;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Map.Entry;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.model.PipelineResult;
import stirling.software.SPDF.service.ApiDocService;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.util.TempFileBackedResource;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.ZipExtractionUtils;

@Service
@Slf4j
public class PipelineProcessor {

    private final ApiDocService apiDocService;

    private final InternalApiClient internalApiClient;

    private final TempFileManager tempFileManager;

    public PipelineProcessor(
            ApiDocService apiDocService,
            InternalApiClient internalApiClient,
            TempFileManager tempFileManager) {
        this.apiDocService = apiDocService;
        this.internalApiClient = internalApiClient;
        this.tempFileManager = tempFileManager;
    }

    public static String removeTrailingNaming(String filename) {
        // Splitting filename into name and extension
        int dotIndex = filename.lastIndexOf('.');
        if (dotIndex == -1) {
            // No extension found
            return filename;
        }
        String name = filename.substring(0, dotIndex);
        String extension = filename.substring(dotIndex);
        // Finding the last underscore
        int underscoreIndex = name.lastIndexOf('_');
        if (underscoreIndex == -1) {
            // No underscore found
            return filename;
        }
        // Removing the last part and reattaching the extension
        return name.substring(0, underscoreIndex) + extension;
    }

    PipelineResult runPipelineAgainstFiles(List<Resource> outputFiles, PipelineConfig config)
            throws Exception {
        PipelineResult result = new PipelineResult();

        ByteArrayOutputStream logStream = new ByteArrayOutputStream();
        PrintStream logPrintStream = new PrintStream(logStream);
        boolean hasErrors = false;
        boolean filtersApplied = false;
        for (PipelineOperation pipelineOperation : config.getOperations()) {
            String operation = pipelineOperation.getOperation();
            boolean isMultiInputOperation = apiDocService.isMultiInput(operation);
            log.info(
                    "Running operation: {} isMultiInputOperation {}",
                    operation,
                    isMultiInputOperation);
            Map<String, Object> parameters = pipelineOperation.getParameters();
            List<String> inputFileTypes = apiDocService.getExtensionTypes(false, operation);
            if (inputFileTypes == null) {
                inputFileTypes = new ArrayList<>(List.of("ALL"));
            }

            if (!apiDocService.isValidOperation(operation, parameters)) {
                log.error("Invalid operation or parameters: o:{} p:{}", operation, parameters);
                throw new IllegalArgumentException(
                        "Invalid operation: " + operation + " with parameters: " + parameters);
            }

            List<Resource> newOutputFiles = new ArrayList<>();
            if (!isMultiInputOperation) {
                for (Resource file : outputFiles) {
                    boolean hasInputFileType = false;
                    for (String extension : inputFileTypes) {
                        if ("ALL".equals(extension)
                                || file.getFilename()
                                        .toLowerCase(Locale.ROOT)
                                        .endsWith(extension)) {
                            hasInputFileType = true;
                            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
                            body.add("fileInput", file);
                            for (Entry<String, Object> entry : parameters.entrySet()) {
                                if (entry.getValue() instanceof List<?> entryList) {
                                    for (Object item : entryList) {
                                        body.add(entry.getKey(), item);
                                    }
                                } else {
                                    body.add(entry.getKey(), entry.getValue());
                                }
                            }
                            ResponseEntity<Resource> response =
                                    internalApiClient.post(operation, body);
                            // If the operation is filter and the response body is null or empty,
                            // skip
                            // this
                            // file
                            if (response.getBody()
                                    instanceof TempFileBackedResource tempFileResource) {
                                result.addTempFile(tempFileResource.getTempFile());
                            }

                            if (operation.startsWith("/api/v1/filter/filter-")
                                    && (response.getBody() == null
                                            || response.getBody().contentLength() == 0)) {
                                filtersApplied = true;
                                log.info("Skipping file due to filtering {}", operation);
                                continue;
                            }
                            if (!HttpStatus.OK.equals(response.getStatusCode())) {
                                logPrintStream.println("Error: " + response.getBody());
                                hasErrors = true;
                                continue;
                            }
                            processOutputFiles(operation, response, newOutputFiles, result);
                        }
                    }
                    if (!hasInputFileType) {
                        String filename = file.getFilename();
                        String providedExtension = "no extension";
                        if (filename != null && filename.contains(".")) {
                            providedExtension =
                                    filename.substring(filename.lastIndexOf('.'))
                                            .toLowerCase(Locale.ROOT);
                        }

                        logPrintStream.println(
                                "No files with extension "
                                        + String.join(", ", inputFileTypes)
                                        + " found for operation "
                                        + operation
                                        + ". Provided file '"
                                        + filename
                                        + "' has extension: "
                                        + providedExtension);
                        hasErrors = true;
                    }
                }
            } else {
                // Filter and collect all files that match the inputFileExtension
                List<Resource> matchingFiles;
                if (inputFileTypes.contains("ALL")) {
                    matchingFiles = new ArrayList<>(outputFiles);
                } else {
                    final List<String> finalinputFileTypes = inputFileTypes;
                    matchingFiles =
                            outputFiles.stream()
                                    .filter(
                                            file ->
                                                    finalinputFileTypes.stream()
                                                            .anyMatch(
                                                                    file.getFilename()
                                                                                    .toLowerCase(
                                                                                            Locale
                                                                                                    .ROOT)
                                                                            ::endsWith))
                                    .toList();
                }
                // Check if there are matching files
                if (!matchingFiles.isEmpty()) {
                    // Create a new MultiValueMap for the request body
                    MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
                    // Add all matching files to the body
                    for (Resource file : matchingFiles) {
                        body.add("fileInput", file);
                    }
                    for (Entry<String, Object> entry : parameters.entrySet()) {
                        if (entry.getValue() instanceof List<?> entryList) {
                            for (Object item : entryList) {
                                body.add(entry.getKey(), item);
                            }
                        } else {
                            body.add(entry.getKey(), entry.getValue());
                        }
                    }
                    ResponseEntity<Resource> response = internalApiClient.post(operation, body);
                    if (response.getBody() instanceof TempFileBackedResource tempFileResource) {
                        result.addTempFile(tempFileResource.getTempFile());
                    }
                    // Handle the response
                    if (HttpStatus.OK.equals(response.getStatusCode())) {
                        processOutputFiles(operation, response, newOutputFiles, result);
                    } else {
                        // Log error if the response status is not OK
                        logPrintStream.println(
                                "Error in multi-input operation: " + response.getBody());
                        hasErrors = true;
                    }
                } else {
                    // Get details about what files were actually provided
                    List<String> providedExtensions =
                            outputFiles.stream()
                                    .map(
                                            file -> {
                                                String filename = file.getFilename();
                                                if (filename != null && filename.contains(".")) {
                                                    return filename.substring(
                                                                    filename.lastIndexOf('.'))
                                                            .toLowerCase(Locale.ROOT);
                                                }
                                                return "no extension";
                                            })
                                    .distinct()
                                    .toList();

                    logPrintStream.println(
                            "No files with extension "
                                    + String.join(", ", inputFileTypes)
                                    + " found for multi-input operation "
                                    + operation
                                    + ". Provided files have extensions: "
                                    + String.join(", ", providedExtensions)
                                    + " (total files: "
                                    + outputFiles.size()
                                    + ")");
                    hasErrors = true;
                }
            }
            logPrintStream.close();
            outputFiles = newOutputFiles;
        }
        if (hasErrors) {
            log.error("Errors occurred during processing. Log: {}", logStream.toString());
        }
        result.setHasErrors(hasErrors);
        result.setFiltersApplied(filtersApplied);
        result.setOutputFiles(outputFiles);
        return result;
    }

    private List<Resource> processOutputFiles(
            String operation,
            ResponseEntity<Resource> response,
            List<Resource> newOutputFiles,
            PipelineResult result)
            throws IOException {
        // Define filename
        String newFilename;
        if (operation.contains("auto-rename")) {
            // If the operation is "auto-rename", generate a new filename.
            // This is a simple example of generating a filename using current timestamp.
            // Modify as per your needs.
            newFilename = extractFilename(response);
        } else {
            // Otherwise, keep the original filename.
            newFilename = removeTrailingNaming(extractFilename(response));
        }
        // Check if the response body is a zip file
        if (ZipExtractionUtils.isZip(response.getBody(), newFilename)) {
            // Unzip the file and add all the files to the new output files
            newOutputFiles.addAll(
                    ZipExtractionUtils.extractZip(
                            response.getBody(), tempFileManager, result::addTempFile));
        } else {
            final Resource tempResource = response.getBody();
            if (tempResource instanceof TempFileBackedResource tfr) {
                result.addTempFile(tfr.getTempFile());
            }
            Resource outputResource =
                    new FileSystemResource(tempResource.getFile()) {

                        @Override
                        public String getFilename() {
                            return newFilename;
                        }
                    };
            newOutputFiles.add(outputResource);
        }
        return newOutputFiles;
    }

    public String extractFilename(ResponseEntity<Resource> response) {
        // Default filename if not found
        String filename = "default-filename.ext";
        HttpHeaders headers = response.getHeaders();
        String contentDisposition = headers.getFirst(HttpHeaders.CONTENT_DISPOSITION);
        if (contentDisposition != null && !contentDisposition.isEmpty()) {
            String[] parts = contentDisposition.split(";");
            for (String part : parts) {
                if (part.trim().startsWith("filename")) {
                    // Extracts filename and removes quotes if present
                    filename = part.split("=")[1].trim().replace("\"", "");
                    filename = URLDecoder.decode(filename, StandardCharsets.UTF_8);
                    break;
                }
            }
        }
        return filename;
    }

    List<Resource> generateInputFiles(File[] files) throws Exception {
        if (files == null || files.length == 0) {
            log.info("No files");
            return null;
        }
        List<Resource> outputFiles = new ArrayList<>();
        for (File file : files) {
            Path normalizedPath = Paths.get(file.getName()).normalize();
            if (normalizedPath.startsWith("..")) {
                throw new SecurityException(
                        "Potential path traversal attempt in file name: " + file.getName());
            }
            Path path = Paths.get(file.getAbsolutePath());
            // debug statement
            log.info("Reading file: {}", path);
            if (Files.exists(path)) {
                Resource fileResource = new FileSystemResource(file);
                outputFiles.add(fileResource);
            } else {
                log.info("File not found: {}", path);
            }
        }
        log.info("Files successfully loaded. Starting processing...");
        return outputFiles;
    }

    List<Resource> generateInputFiles(MultipartFile[] files) throws Exception {
        if (files == null || files.length == 0) {
            log.info("No files");
            return null;
        }
        List<Resource> outputFiles = new ArrayList<>();
        for (MultipartFile file : files) {
            Path tempFile = Files.createTempFile("SPDF-upload-", ".tmp");
            file.transferTo(tempFile);

            Resource fileResource =
                    new FileSystemResource(tempFile.toFile()) {

                        @Override
                        public String getFilename() {
                            return Filenames.toSimpleFileName(file.getOriginalFilename());
                        }
                    };
            outputFiles.add(fileResource);
        }
        log.info("Files successfully loaded. Starting processing...");
        return outputFiles;
    }
}
