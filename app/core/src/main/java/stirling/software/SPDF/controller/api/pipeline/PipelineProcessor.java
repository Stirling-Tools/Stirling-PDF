package stirling.software.SPDF.controller.api.pipeline;

import java.io.*;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Map.Entry;

import io.github.pixee.security.Filenames;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.model.PipelineResult;
import stirling.software.SPDF.service.ApiDocService;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.io.FileSystemResource;
import stirling.software.common.model.io.Resource;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.ZipExtractionUtils;

@ApplicationScoped
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

    /**
     * Add a value to a multi-value form body. The body is a {@code Map<String, List<Object>>}
     * (replacing Spring's {@code MultiValueMap}) because the migrated {@link InternalApiClient}
     * encodes the multipart body from that shape.
     */
    private static void addToBody(Map<String, List<Object>> body, String key, Object value) {
        body.computeIfAbsent(key, k -> new ArrayList<>()).add(value);
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
                            Map<String, List<Object>> body = new LinkedHashMap<>();
                            addToBody(body, "fileInput", file);
                            for (Entry<String, Object> entry : parameters.entrySet()) {
                                if (entry.getValue() instanceof List<?> entryList) {
                                    for (Object item : entryList) {
                                        addToBody(body, entry.getKey(), item);
                                    }
                                } else {
                                    addToBody(body, entry.getKey(), entry.getValue());
                                }
                            }
                            Response response = internalApiClient.post(operation, body);
                            Resource responseBody = (Resource) response.getEntity();
                            // If the operation is filter and the response body is null or empty,
                            // skip
                            // this
                            // file
                            if (responseBody
                                    instanceof
                                    InternalApiClient.TempFileResource tempFileResource) {
                                result.addTempFile(tempFileResource.getTempFile());
                            }

                            if (operation.startsWith("/api/v1/filter/filter-")
                                    && (responseBody == null
                                            || responseBody.contentLength() == 0)) {
                                filtersApplied = true;
                                log.info("Skipping file due to filtering {}", operation);
                                continue;
                            }
                            if (response.getStatus() != Response.Status.OK.getStatusCode()) {
                                logPrintStream.println("Error: " + responseBody);
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
                    // Create a new multi-value body for the request
                    Map<String, List<Object>> body = new LinkedHashMap<>();
                    // Add all matching files to the body
                    for (Resource file : matchingFiles) {
                        addToBody(body, "fileInput", file);
                    }
                    for (Entry<String, Object> entry : parameters.entrySet()) {
                        if (entry.getValue() instanceof List<?> entryList) {
                            for (Object item : entryList) {
                                addToBody(body, entry.getKey(), item);
                            }
                        } else {
                            addToBody(body, entry.getKey(), entry.getValue());
                        }
                    }
                    Response response = internalApiClient.post(operation, body);
                    Resource responseBody = (Resource) response.getEntity();
                    if (responseBody
                            instanceof InternalApiClient.TempFileResource tempFileResource) {
                        result.addTempFile(tempFileResource.getTempFile());
                    }
                    // Handle the response
                    if (response.getStatus() == Response.Status.OK.getStatusCode()) {
                        processOutputFiles(operation, response, newOutputFiles, result);
                    } else {
                        // Log error if the response status is not OK
                        logPrintStream.println("Error in multi-input operation: " + responseBody);
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
            Response response,
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
        final String finalNewFilename = newFilename;
        Resource responseBody = (Resource) response.getEntity();
        // Check if the response body is a zip file
        if (ZipExtractionUtils.isZip(responseBody, newFilename)) {
            // Unzip the file and add all the files to the new output files
            newOutputFiles.addAll(
                    ZipExtractionUtils.extractZip(
                            responseBody, tempFileManager, result::addTempFile));
        } else {
            final Resource tempResource = responseBody;
            if (tempResource instanceof InternalApiClient.TempFileResource tfr) {
                result.addTempFile(tfr.getTempFile());
            }
            Resource outputResource =
                    new FileSystemResource(tempResource.getFile()) {

                        @Override
                        public String getFilename() {
                            return finalNewFilename;
                        }
                    };
            newOutputFiles.add(outputResource);
        }
        return newOutputFiles;
    }

    public String extractFilename(Response response) {
        // Default filename if not found
        String filename = "default-filename.ext";
        String contentDisposition = response.getHeaderString(HttpHeaders.CONTENT_DISPOSITION);
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
            Path normalizedPath = Path.of(file.getName()).normalize();
            if (normalizedPath.startsWith("..")) {
                throw new SecurityException(
                        "Potential path traversal attempt in file name: " + file.getName());
            }
            Path path = Path.of(file.getAbsolutePath());
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
