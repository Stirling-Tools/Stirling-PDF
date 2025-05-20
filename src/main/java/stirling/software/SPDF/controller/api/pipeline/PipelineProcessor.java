package stirling.software.SPDF.controller.api.pipeline;

import java.io.*;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.github.pixee.security.ZipSecurity;

import jakarta.servlet.ServletContext;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.SPDFApplication;
import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.model.PipelineResult;
import stirling.software.SPDF.model.Role;

@Service
@Slf4j
public class PipelineProcessor {

    private final ApiDocService apiDocService;

    private final UserServiceInterface userService;

    private final ServletContext servletContext;

    public PipelineProcessor(
            ApiDocService apiDocService,
            @Autowired(required = false) UserServiceInterface userService,
            ServletContext servletContext) {
        this.apiDocService = apiDocService;
        this.userService = userService;
        this.servletContext = servletContext;
    }

    public static String removeTrailingNaming(String filename) {
        // Splitting filename into name and extension
        int dotIndex = filename.lastIndexOf(".");
        if (dotIndex == -1) {
            // No extension found
            return filename;
        }
        String name = filename.substring(0, dotIndex);
        String extension = filename.substring(dotIndex);
        // Finding the last underscore
        int underscoreIndex = name.lastIndexOf("_");
        if (underscoreIndex == -1) {
            // No underscore found
            return filename;
        }
        // Removing the last part and reattaching the extension
        return name.substring(0, underscoreIndex) + extension;
    }

    private String getApiKeyForUser() {
        if (userService == null) return "";
        return userService.getApiKeyForUser(Role.INTERNAL_API_USER.getRoleId());
    }

    private String getBaseUrl() {
        String contextPath = servletContext.getContextPath();
        String port = SPDFApplication.getStaticPort();
        return "http://localhost:" + port + contextPath + "/";
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
                inputFileTypes = new ArrayList<String>(Arrays.asList("ALL"));
            }
            // List outputFileTypes = apiDocService.getExtensionTypes(true, operation);
            String url = getBaseUrl() + operation;
            List<Resource> newOutputFiles = new ArrayList<>();
            if (!isMultiInputOperation) {
                for (Resource file : outputFiles) {
                    boolean hasInputFileType = false;
                    for (String extension : inputFileTypes) {
                        if ("ALL".equals(extension)
                                || file.getFilename().toLowerCase().endsWith(extension)) {
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
                            ResponseEntity<byte[]> response = sendWebRequest(url, body);
                            // If the operation is filter and the response body is null or empty,
                            // skip
                            // this
                            // file
                            if (operation.startsWith("filter-")
                                    && (response.getBody() == null
                                            || response.getBody().length == 0)) {
                                filtersApplied = true;
                                log.info("Skipping file due to filtering {}", operation);
                                continue;
                            }
                            if (!HttpStatus.OK.equals(response.getStatusCode())) {
                                logPrintStream.println("Error: " + response.getBody());
                                hasErrors = true;
                                continue;
                            }
                            processOutputFiles(operation, response, newOutputFiles);
                        }
                    }
                    if (!hasInputFileType) {
                        logPrintStream.println(
                                "No files with extension "
                                        + String.join(", ", inputFileTypes)
                                        + " found for operation "
                                        + operation);
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
                                                                    file.getFilename().toLowerCase()
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
                    ResponseEntity<byte[]> response = sendWebRequest(url, body);
                    // Handle the response
                    if (HttpStatus.OK.equals(response.getStatusCode())) {
                        processOutputFiles(operation, response, newOutputFiles);
                    } else {
                        // Log error if the response status is not OK
                        logPrintStream.println(
                                "Error in multi-input operation: " + response.getBody());
                        hasErrors = true;
                    }
                } else {
                    logPrintStream.println(
                            "No files with extension "
                                    + String.join(", ", inputFileTypes)
                                    + " found for multi-input operation "
                                    + operation);
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

    /* package */ ResponseEntity<byte[]> sendWebRequest(String url, MultiValueMap<String, Object> body) {
        RestTemplate restTemplate = new RestTemplate();
        // Set up headers, including API key
        HttpHeaders headers = new HttpHeaders();
        String apiKey = getApiKeyForUser();
        headers.add("X-API-KEY", apiKey);
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        // Create HttpEntity with the body and headers
        HttpEntity<MultiValueMap<String, Object>> entity = new HttpEntity<>(body, headers);
        // Make the request to the REST endpoint
        return restTemplate.exchange(url, HttpMethod.POST, entity, byte[].class);
    }

    private List<Resource> processOutputFiles(
            String operation, ResponseEntity<byte[]> response, List<Resource> newOutputFiles)
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
        if (isZip(response.getBody())) {
            // Unzip the file and add all the files to the new output files
            newOutputFiles.addAll(unzip(response.getBody()));
        } else {
            Resource outputResource =
                    new ByteArrayResource(response.getBody()) {

                        @Override
                        public String getFilename() {
                            return newFilename;
                        }
                    };
            newOutputFiles.add(outputResource);
        }
        return newOutputFiles;
    }

    public String extractFilename(ResponseEntity<byte[]> response) {
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
            Path path = Paths.get(file.getAbsolutePath());
            // debug statement
            log.info("Reading file: " + path);
            if (Files.exists(path)) {
                Resource fileResource =
                        new ByteArrayResource(Files.readAllBytes(path)) {

                            @Override
                            public String getFilename() {
                                return file.getName();
                            }
                        };
                outputFiles.add(fileResource);
            } else {
                log.info("File not found: " + path);
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
            Resource fileResource =
                    new ByteArrayResource(file.getBytes()) {

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

    private boolean isZip(byte[] data) {
        if (data == null || data.length < 4) {
            return false;
        }
        // Check the first four bytes of the data against the standard zip magic number
        return data[0] == 0x50 && data[1] == 0x4B && data[2] == 0x03 && data[3] == 0x04;
    }

    private List<Resource> unzip(byte[] data) throws IOException {
        log.info("Unzipping data of length: {}", data.length);
        List<Resource> unzippedFiles = new ArrayList<>();
        try (ByteArrayInputStream bais = new ByteArrayInputStream(data);
                ZipInputStream zis = ZipSecurity.createHardenedInputStream(bais)) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                byte[] buffer = new byte[1024];
                int count;
                while ((count = zis.read(buffer)) != -1) {
                    baos.write(buffer, 0, count);
                }
                final String filename = entry.getName();
                Resource fileResource =
                        new ByteArrayResource(baos.toByteArray()) {

                            @Override
                            public String getFilename() {
                                return filename;
                            }
                        };
                // If the unzipped file is a zip file, unzip it
                if (isZip(baos.toByteArray())) {
                    log.info("File {} is a zip file. Unzipping...", filename);
                    unzippedFiles.addAll(unzip(baos.toByteArray()));
                } else {
                    unzippedFiles.add(fileResource);
                }
            }
        }
        log.info("Unzipping completed. {} files were unzipped.", unzippedFiles.size());
        return unzippedFiles;
    }
}
