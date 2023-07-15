package stirling.software.SPDF.controller.api.pipeline;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "Pipeline", description = "Pipeline APIs")
public class PipelineController {

	private static final Logger logger = LoggerFactory.getLogger(PipelineController.class);
	@Autowired
	private ObjectMapper objectMapper;

	final String jsonFileName = "pipelineConfig.json";
	final String watchedFoldersDir = "./pipeline/watchedFolders/";
	final String finishedFoldersDir = "./pipeline/finishedFolders/";
	
	@Scheduled(fixedRate = 25000)
	public void scanFolders() {
		logger.info("Scanning folders...");
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
			paths.filter(Files::isDirectory).forEach(t -> {
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

	private void handleDirectory(Path dir) throws Exception {
		logger.info("Handling directory: {}", dir);
		Path jsonFile = dir.resolve(jsonFileName);
		Path processingDir = dir.resolve("processing"); // Directory to move files during processing
		if (!Files.exists(processingDir)) {
			Files.createDirectory(processingDir);
			logger.info("Created processing directory: {}", processingDir);
		}

		if (Files.exists(jsonFile)) {
			// Read JSON file
			String jsonString;
			try {
				jsonString = new String(Files.readAllBytes(jsonFile));
				logger.info("Read JSON file: {}", jsonFile);
			} catch (IOException e) {
				logger.error("Error reading JSON file: {}", jsonFile, e);
				return;
			}

			// Decode JSON to PipelineConfig
			PipelineConfig config;
			try {
				config = objectMapper.readValue(jsonString, PipelineConfig.class);
				// Assuming your PipelineConfig class has getters for all necessary fields, you
				// can perform checks here
				if (config.getOperations() == null || config.getOutputDir() == null || config.getName() == null) {
					throw new IOException("Invalid JSON format");
				}
			} catch (IOException e) {
				logger.error("Error parsing PipelineConfig: {}", jsonString, e);
				return;
			}

			// For each operation in the pipeline
			for (PipelineOperation operation : config.getOperations()) {
				// Collect all files based on fileInput
				File[] files;
				String fileInput = (String) operation.getParameters().get("fileInput");
				if ("automated".equals(fileInput)) {
					// If fileInput is "automated", process all files in the directory
					try (Stream<Path> paths = Files.list(dir)) {
						files = paths
							    .filter(path -> !Files.isDirectory(path)) // exclude directories
							    .filter(path -> !path.equals(jsonFile)) // exclude jsonFile
							    .map(Path::toFile)
							    .toArray(File[]::new);

					} catch (IOException e) {
						e.printStackTrace();
						return;
					}
				} else {
					// If fileInput contains a path, process only this file
					files = new File[] { new File(fileInput) };
				}

				// Prepare the files for processing
				List<File> filesToProcess = new ArrayList<>();
				for (File file : files) {
				    logger.info(file.getName());
				    logger.info("{} to {}",file.toPath(), processingDir.resolve(file.getName()));
				    Files.move(file.toPath(), processingDir.resolve(file.getName()));
				    filesToProcess.add(processingDir.resolve(file.getName()).toFile());
				}

				// Process the files
				try {
				    List<Resource> resources = handleFiles(filesToProcess.toArray(new File[0]), jsonString);
				    
					if(resources == null) {
						return;
					}
					// Move resultant files and rename them as per config in JSON file
					for (Resource resource : resources) {
						String resourceName = resource.getFilename();
						String baseName = resourceName.substring(0, resourceName.lastIndexOf("."));
						String extension = resourceName.substring(resourceName.lastIndexOf(".")+1);
						
						String outputFileName = config.getOutputPattern().replace("{filename}", baseName);
						
						outputFileName = outputFileName.replace("{pipelineName}", config.getName());
						DateTimeFormatter dateFormatter = DateTimeFormatter.ofPattern("yyyyMMdd");
						outputFileName = outputFileName.replace("{date}", LocalDate.now().format(dateFormatter));
						DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("HHmmss");
						outputFileName = outputFileName.replace("{time}", LocalTime.now().format(timeFormatter));
						
						outputFileName += "." + extension;
						// {filename} {folder} {date} {tmime} {pipeline}
						String outputDir = config.getOutputDir();

						// Check if the environment variable 'automatedOutputFolder' is set
						String outputFolder = System.getenv("automatedOutputFolder");

						if (outputFolder == null || outputFolder.isEmpty()) {
						    // If the environment variable is not set, use the default value
						    outputFolder = finishedFoldersDir;
						}
						logger.info("outputDir 0={}", outputDir);
						// Replace the placeholders in the outputDir string
						outputDir = outputDir.replace("{outputFolder}", outputFolder);
						outputDir = outputDir.replace("{folderName}", dir.toString());
						logger.info("outputDir 1={}", outputDir);
						outputDir = outputDir.replace("\\watchedFolders", "");
						outputDir = outputDir.replace("//watchedFolders", "");
						outputDir = outputDir.replace("\\\\watchedFolders", "");
						outputDir = outputDir.replace("/watchedFolders", "");
						
						Path outputPath; 
						logger.info("outputDir 2={}", outputDir);
						if (Paths.get(outputDir).isAbsolute()) {
						    // If it's an absolute path, use it directly
						    outputPath = Paths.get(outputDir);
						} else {
						    // If it's a relative path, make it relative to the current working directory
						    outputPath = Paths.get(".", outputDir);
						}
						
						logger.info("outputPath={}", outputPath);
						
						if (!Files.exists(outputPath)) {
							try {
								Files.createDirectories(outputPath);
								logger.info("Created directory: {}", outputPath);
							} catch (IOException e) {
								logger.error("Error creating directory: {}", outputPath, e);
								return;
							}
						}
						logger.info("outputPath {}", outputPath);	
						logger.info("outputPath.resolve(outputFileName).toString() {}", outputPath.resolve(outputFileName).toString());	
						File newFile = new File(outputPath.resolve(outputFileName).toString());
					    OutputStream os = new FileOutputStream(newFile);
					    os.write(((ByteArrayResource)resource).getByteArray());
					    os.close();
						logger.info("made {}", outputPath.resolve(outputFileName));	
					}

					// If successful, delete the original files
					for (File file : filesToProcess) {
						Files.deleteIfExists(processingDir.resolve(file.getName()));
					}
				} catch (Exception e) {
					// If an error occurs, move the original files back
					for (File file : filesToProcess) {
						Files.move(processingDir.resolve(file.getName()), file.toPath());
					}
					throw e;
				}
			}
		}
	}

	List<Resource> processFiles(List<Resource> outputFiles, String jsonString) throws Exception {
		
		ObjectMapper mapper = new ObjectMapper();
		JsonNode jsonNode = mapper.readTree(jsonString);

		JsonNode pipelineNode = jsonNode.get("pipeline");
		logger.info("Running pipelineNode: {}", pipelineNode);
		ByteArrayOutputStream logStream = new ByteArrayOutputStream();
		PrintStream logPrintStream = new PrintStream(logStream);

		boolean hasErrors = false;

		for (JsonNode operationNode : pipelineNode) {
			String operation = operationNode.get("operation").asText();
			logger.info("Running operation: {}", operation);
			JsonNode parametersNode = operationNode.get("parameters");
			String inputFileExtension = "";
			if (operationNode.has("inputFileType")) {
				inputFileExtension = operationNode.get("inputFileType").asText();
			} else {
				inputFileExtension = ".pdf";
			}

			List<Resource> newOutputFiles = new ArrayList<>();
			boolean hasInputFileType = false;

			for (Resource file : outputFiles) {
				if (file.getFilename().endsWith(inputFileExtension)) {
					hasInputFileType = true;
					MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
					body.add("fileInput", file);

					Iterator<Map.Entry<String, JsonNode>> parameters = parametersNode.fields();
					while (parameters.hasNext()) {
						Map.Entry<String, JsonNode> parameter = parameters.next();
						body.add(parameter.getKey(), parameter.getValue().asText());
					}

					HttpHeaders headers = new HttpHeaders();
					headers.setContentType(MediaType.MULTIPART_FORM_DATA);

					HttpEntity<MultiValueMap<String, Object>> entity = new HttpEntity<>(body, headers);

					RestTemplate restTemplate = new RestTemplate();
					String url = "http://localhost:8080/" + operation;

					ResponseEntity<byte[]> response = restTemplate.exchange(url, HttpMethod.POST, entity, byte[].class);

					// If the operation is filter and the response body is null or empty, skip this file
	                if (operation.startsWith("filter-") && (response.getBody() == null || response.getBody().length == 0)) {
	                	logger.info("Skipping file due to failing {}", operation);
	                    continue;
	                }
	                
					if (!response.getStatusCode().equals(HttpStatus.OK)) {
						logPrintStream.println("Error: " + response.getBody());
						hasErrors = true;
						continue;
					}
					
					
					// Define filename
	                String filename;
	                if ("auto-rename".equals(operation)) {
	                    // If the operation is "auto-rename", generate a new filename.
	                    // This is a simple example of generating a filename using current timestamp.
	                    // Modify as per your needs.
	                    filename = "file_" + System.currentTimeMillis();
	                } else {
	                    // Otherwise, keep the original filename.
	                    filename = file.getFilename();
	                }

	                // Check if the response body is a zip file
	                if (isZip(response.getBody())) {
	                    // Unzip the file and add all the files to the new output files
	                    newOutputFiles.addAll(unzip(response.getBody()));
	                } else {
	                    Resource outputResource = new ByteArrayResource(response.getBody()) {
	                        @Override
	                        public String getFilename() {
	                            return filename;
	                        }
	                    };
	                    newOutputFiles.add(outputResource);
	                }
				}

				if (!hasInputFileType) {
					logPrintStream.println(
							"No files with extension " + inputFileExtension + " found for operation " + operation);
					hasErrors = true;
				}

				outputFiles = newOutputFiles;
			}
			logPrintStream.close();

		}
		if (hasErrors) {
			logger.error("Errors occurred during processing. Log: {}", logStream.toString());
		}
		return outputFiles;
	}

	List<Resource> handleFiles(File[] files, String jsonString) throws Exception {
		if(files == null || files.length == 0) {
			logger.info("No files");
			return null;
		}
			
		logger.info("Handling files: {} files, with JSON string of length: {}", files.length, jsonString.length());
		
		ObjectMapper mapper = new ObjectMapper();
		JsonNode jsonNode = mapper.readTree(jsonString);

		JsonNode pipelineNode = jsonNode.get("pipeline");

		boolean hasErrors = false;
		List<Resource> outputFiles = new ArrayList<>();

		for (File file : files) {
		    Path path = Paths.get(file.getAbsolutePath());
		    System.out.println("Reading file: " + path); // debug statement
		    
		    if (Files.exists(path)) {
		        Resource fileResource = new ByteArrayResource(Files.readAllBytes(path)) {
		            @Override
		            public String getFilename() {
		                return file.getName();
		            }
		        };
		        outputFiles.add(fileResource);
		    } else {
		        System.out.println("File not found: " + path); // debug statement
		    }
		}
		logger.info("Files successfully loaded. Starting processing...");
		return processFiles(outputFiles, jsonString);
	}

	List<Resource> handleFiles(MultipartFile[] files, String jsonString) throws Exception {
		if(files == null || files.length == 0) {
			logger.info("No files");
			return null;
		}
		logger.info("Handling files: {} files, with JSON string of length: {}", files.length, jsonString.length());
		ObjectMapper mapper = new ObjectMapper();
		JsonNode jsonNode = mapper.readTree(jsonString);

		JsonNode pipelineNode = jsonNode.get("pipeline");

		boolean hasErrors = false;
		List<Resource> outputFiles = new ArrayList<>();

		for (MultipartFile file : files) {
			Resource fileResource = new ByteArrayResource(file.getBytes()) {
				@Override
				public String getFilename() {
					return file.getOriginalFilename();
				}
			};
			outputFiles.add(fileResource);
		}
		logger.info("Files successfully loaded. Starting processing...");
		return processFiles(outputFiles, jsonString);
	}

	@PostMapping("/handleData")
	public ResponseEntity<byte[]> handleData(@RequestPart("fileInput") MultipartFile[] files,
			@RequestParam("json") String jsonString) {
		logger.info("Received POST request to /handleData with {} files", files.length);
		try {
			List<Resource> outputFiles = handleFiles(files, jsonString);

			if (outputFiles != null && outputFiles.size() == 1) {
				// If there is only one file, return it directly
				Resource singleFile = outputFiles.get(0);
				InputStream is = singleFile.getInputStream();
				byte[] bytes = new byte[(int) singleFile.contentLength()];
				is.read(bytes);
				is.close();

				logger.info("Returning single file response...");
				return WebResponseUtils.bytesToWebResponse(bytes, singleFile.getFilename(),
						MediaType.APPLICATION_OCTET_STREAM);
			} else if (outputFiles == null) {
				return null;
			}

			// Create a ByteArrayOutputStream to hold the zip
			ByteArrayOutputStream baos = new ByteArrayOutputStream();
			ZipOutputStream zipOut = new ZipOutputStream(baos);

			// Loop through each file and add it to the zip
			for (Resource file : outputFiles) {
				ZipEntry zipEntry = new ZipEntry(file.getFilename());
				zipOut.putNextEntry(zipEntry);

				// Read the file into a byte array
				InputStream is = file.getInputStream();
				byte[] bytes = new byte[(int) file.contentLength()];
				is.read(bytes);

				// Write the bytes of the file to the zip
				zipOut.write(bytes, 0, bytes.length);
				zipOut.closeEntry();

				is.close();
			}

			zipOut.close();

			logger.info("Returning zipped file response...");
			return WebResponseUtils.boasToWebResponse(baos, "output.zip", MediaType.APPLICATION_OCTET_STREAM);
		} catch (Exception e) {
			logger.error("Error handling data: ", e);
			return null;
		}
	}

	private boolean isZip(byte[] data) {
		if (data == null || data.length < 4) {
			return false;
		}

		// Check the first four bytes of the data against the standard zip magic number
		return data[0] == 0x50 && data[1] == 0x4B && data[2] == 0x03 && data[3] == 0x04;
	}

	private List<Resource> unzip(byte[] data) throws IOException {
		logger.info("Unzipping data of length: {}", data.length);
		List<Resource> unzippedFiles = new ArrayList<>();

		try (ByteArrayInputStream bais = new ByteArrayInputStream(data);
				ZipInputStream zis = new ZipInputStream(bais)) {

			ZipEntry entry;
			while ((entry = zis.getNextEntry()) != null) {
				ByteArrayOutputStream baos = new ByteArrayOutputStream();
				byte[] buffer = new byte[1024];
				int count;

				while ((count = zis.read(buffer)) != -1) {
					baos.write(buffer, 0, count);
				}

				final String filename = entry.getName();
				Resource fileResource = new ByteArrayResource(baos.toByteArray()) {
					@Override
					public String getFilename() {
						return filename;
					}
				};

				// If the unzipped file is a zip file, unzip it
				if (isZip(baos.toByteArray())) {
					logger.info("File {} is a zip file. Unzipping...", filename);
					unzippedFiles.addAll(unzip(baos.toByteArray()));
				} else {
					unzippedFiles.add(fileResource);
				}
			}
		}

		logger.info("Unzipping completed. {} files were unzipped.", unzippedFiles.size());
		return unzippedFiles;
	}

}
