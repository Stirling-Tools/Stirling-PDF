package stirling.software.SPDF.controller.api.pipeline;

import java.io.*;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.Map.Entry;
import java.util.stream.Collectors;
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
import stirling.software.SPDF.service.ApiDocService;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.service.UserServiceInterface;

@Service
@Slf4j
public class PipelineProcessor {

    // ------------------------
    // AUTOWIRED
    // ------------------------
    private final ApiDocService apiDocService;
    private final UserServiceInterface userService;
    private final ServletContext servletContext;

    // ------------------------
    // CONSTRUCTORS
    // ------------------------
    public PipelineProcessor(
            ApiDocService apiDocService,
            @Autowired(required = false) UserServiceInterface userService,
            ServletContext servletContext) {
        this.apiDocService = apiDocService;
        this.userService = userService;
        this.servletContext = servletContext;
    }

    // ------------------------
    // METHODS
    // ------------------------
    PipelineResult runPipelineAgainstFiles(Map<String, Resource> files, PipelineConfig config)
            throws Exception {

        ByteArrayOutputStream logStream = new ByteArrayOutputStream();
        PrintStream logPrintStream = new PrintStream(logStream);
        boolean hasErrors = false;
        boolean filtersApplied = false;
        List<Resource> lastOutputFiles = new ArrayList<>();

        for (PipelineOperation pipelineOperation : config.getOperations()) {
            // prepare operation
            String operation = pipelineOperation.getOperation();
            boolean isMultiInputOperation = apiDocService.isMultiInput(operation);
            log.info(
                    "Running operation: {} isMultiInputOperation {}",
                    operation,
                    isMultiInputOperation);
            Map<String, Object> parameters = pipelineOperation.getParameters();
            if (!apiDocService.isValidOperation(operation, parameters)) {
                log.error("Invalid operation or parameters: o:{} p:{}", operation, parameters);
                throw new IllegalArgumentException(
                        "Invalid operation: " + operation + " with parameters: " + parameters);
            }
            String url = getBaseUrl() + operation;

            // convert operation's parameters to Request Body
            MultiValueMap<String, Object> body = this.convertToRequestBody(parameters);
            // inject files (inputFile and others referenced in parameters)
            this.replaceWithRessource(body, files);
            if (!body.containsKey("inputFile") && !body.containsKey("fileId")) {
                // retrieve inputFile from apiDoc
                Map<String, Resource> inputFiles = this.extractInputFiles(files, operation);
                inputFiles.forEach((k, file) -> body.add("fileInput", file));

                if (inputFiles.isEmpty()) {
                    String expectedTypes = String.join(", ", this.expectedTypes(operation));
                    String fileNames = String.join(", ", files.keySet());
                    logPrintStream.printf(
                            "No files with extensions [%s] found for operation '%s'. Provided files [%s]%n",
                            expectedTypes, operation, fileNames);
                    hasErrors = true;
                    continue;
                }
            }

            // run request
            ResponseEntity<byte[]> response = sendWebRequest(url, body);

            // handle response
            if (operation.startsWith("/api/v1/filter/filter-")
                    && (response.getBody() == null || response.getBody().length == 0)) {
                filtersApplied = true;
                log.info("Skipping file due to filtering {}", operation);
                continue;
            }
            if (!HttpStatus.OK.equals(response.getStatusCode())) {
                logPrintStream.printf(
                        "Error in operation: %s response: %s", operation, response.getBody());
                hasErrors = true;
                continue;
            }

            Map<String, Resource> outputFiles = processOutputFiles(operation, response);
            lastOutputFiles = new ArrayList<>(outputFiles.values());
            files.putAll(outputFiles); // add|replace for next operations
        }

        logPrintStream.close();
        if (hasErrors) {
            log.error("Errors occurred during processing. Log: {}", logStream);
        }

        PipelineResult result = new PipelineResult();
        result.setHasErrors(hasErrors);
        result.setFiltersApplied(filtersApplied);
        result.setOutputFiles(lastOutputFiles);
        return result;
    }

    // ------------------------
    // UTILS
    // ------------------------
    private String removeTrailingNaming(String filename) {
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

    private Set<String> expectedTypes(String operation) {
        // get expected input types
        List<String> inputFileTypes = apiDocService.getExtensionTypes(false, operation);
        if (inputFileTypes == null) return Set.of("ALL"); // early exit (ALL files)
        return new HashSet<>(inputFileTypes);
    }

    /**
     * Extracts and filters the input files based on the expected types for a given operation. The
     * method checks the file extensions against the expected types and returns a map of the
     * filtered files.
     *
     * @param files a map of file names as keys and their corresponding {@link Resource} as values
     * @param operation the specific operation for which files need to be filtered
     * @return a map containing only the files with extensions matching the expected types for the
     *     given operation
     */
    private Map<String, Resource> extractInputFiles(Map<String, Resource> files, String operation) {
        if (files == null) return Map.of(); // early exit

        // get expected input types from apiDoc
        Set<String> types = this.expectedTypes(operation);
        if (types.contains("ALL")) return files; // early exit

        // filter out files that don't match the expected input types
        return files.entrySet().stream()
                .filter(
                        entry -> {
                            String filename = entry.getKey();
                            String ext =
                                    filename.substring(filename.lastIndexOf(".") + 1).toLowerCase();
                            return types.contains(ext);
                        })
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    /**
     * Converts a given map of parameters into a MultiValueMap to represent the request body. This
     * is useful for preparing data for a form-data or application/x-www-form-urlencoded request.
     */
    private MultiValueMap<String, Object> convertToRequestBody(Map<String, Object> parameters) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        for (Entry<String, Object> entry : parameters.entrySet()) {
            if (entry.getValue() instanceof List<?> entryList) {
                for (Object item : entryList) {
                    body.add(entry.getKey(), item);
                }
            } else {
                body.add(entry.getKey(), entry.getValue());
            }
        }
        return body;
    }

    /**
     * Replaces occurrences of file names in the provided body with corresponding resource objects
     * from the given files map.
     */
    private void replaceWithRessource(
            MultiValueMap<String, Object> body, Map<String, Resource> files) {
        Set<String> fileNames = files.keySet();
        body.forEach(
                (key, values) ->
                        values.replaceAll(
                                value ->
                                        (value instanceof String && fileNames.contains(value))
                                                ? files.get(value) // replace it
                                                : value // keep it
                                ));
    }

    /* package */ ResponseEntity<byte[]> sendWebRequest(
            String url, MultiValueMap<String, Object> body) {
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

    private Map<String, Resource> processOutputFiles(
            String operation, ResponseEntity<byte[]> response) throws IOException {
        if (response.getBody() == null || response.getBody().length == 0)
            return Map.of(); // early exit

        // Define filename
        String newFilename;
        if (operation.contains("auto-rename")) {
            // If the operation is "auto-rename", generate a new filename.
            // This is a simple example of generating a filename using current timestamp.
            // Modify as per your needs.
            newFilename = extractFilename(response);
        } else {
            // Otherwise, keep the original filename.
            newFilename = this.removeTrailingNaming(extractFilename(response));
        }
        Map<String, Resource> outputFiles = new HashMap<>();
        // Check if the response body is a zip file
        if (isZip(response.getBody(), newFilename)) {
            // Unzip the file and add all the files to the new output files
            unzip(response.getBody()).forEach(file -> outputFiles.put(file.getFilename(), file));
        } else {
            Resource outputResource =
                    new ByteArrayResource(response.getBody()) {

                        @Override
                        public String getFilename() {
                            return newFilename;
                        }
                    };
            outputFiles.put(newFilename, outputResource);
        }
        return outputFiles;
    }

    private String extractFilename(ResponseEntity<byte[]> response) {
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

    Map<String, Resource> generateInputFiles(File[] files) throws Exception {
        if (files == null || files.length == 0) {
            log.info("No files");
            return Map.of(); // early exit
        }

        Map<String, Resource> outputFiles = new HashMap<>();
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
                Resource fileResource =
                        new ByteArrayResource(Files.readAllBytes(path)) {

                            @Override
                            public String getFilename() {
                                return file.getName();
                            }
                        };
                outputFiles.put(fileResource.getFilename(), fileResource);
            } else {
                log.info("File not found: {}", path);
            }
        }
        log.info("Files successfully loaded. Starting processing...");
        return outputFiles;
    }

    Map<String, Resource> generateInputFiles(MultipartFile[] files) throws Exception {
        if (files == null || files.length == 0) {
            log.warn("No files");
            return Map.of(); // early exit
        }

        Map<String, Resource> outputFiles = new HashMap<>();
        for (MultipartFile file : files) {
            Resource fileResource =
                    new ByteArrayResource(file.getBytes()) {

                        @Override
                        public String getFilename() {
                            return Filenames.toSimpleFileName(file.getOriginalFilename());
                        }
                    };
            outputFiles.put(fileResource.getFilename(), fileResource);
        }
        log.info("Files successfully loaded. Starting processing...");
        return outputFiles;
    }

    private boolean isZip(byte[] data, String filename) {
        if (data == null || data.length < 4) {
            return false;
        }
        if (filename != null) {
            String lower = filename.toLowerCase();
            if (lower.endsWith(".cbz")) {
                // Treat CBZ as non-zip for our unzipping purposes
                return false;
            }
        }
        // Check the first four bytes of the data against the standard zip magic number
        return data[0] == 0x50 && data[1] == 0x4B && data[2] == 0x03 && data[3] == 0x04;
    }

    private boolean isZip(byte[] data) {
        return isZip(data, null);
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
                if (isZip(baos.toByteArray(), filename)) {
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
