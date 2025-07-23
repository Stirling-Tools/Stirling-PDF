package stirling.software.SPDF.controller.api.pipeline;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import jakarta.servlet.ServletContext;

import stirling.software.common.service.UserServiceInterface;
import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.model.PipelineResult;
import stirling.software.SPDF.service.ApiDocService;

@ExtendWith(MockitoExtension.class)
@DisplayName("PipelineProcessor Tests")
class PipelineProcessorTest {

    @Mock ApiDocService apiDocService;

    @Mock UserServiceInterface userService;

    @Mock ServletContext servletContext;

    PipelineProcessor pipelineProcessor;

    @BeforeEach
    void setUp() {
        pipelineProcessor = spy(new PipelineProcessor(apiDocService, userService, servletContext));
    }

    @Nested
    @DisplayName("Pipeline Execution with Filter Tests")
    class PipelineExecutionWithFilterTests {

        @Test
        @DisplayName("Sets filtersApplied flag to true when filter operation is applied")
        void runPipelineWithFilterSetsFlag() throws Exception {
            // Arrange
            PipelineOperation op = new PipelineOperation();
            op.setOperation("filter-page-count");
            op.setParameters(Map.of());
            PipelineConfig config = new PipelineConfig();
            config.setOperations(List.of(op));

            Resource file = new ByteArrayResource("data".getBytes()) {
                @Override
                public String getFilename() {
                    return "test.pdf";
                }
            };

            List<Resource> files = List.of(file);

            when(apiDocService.isMultiInput("filter-page-count")).thenReturn(false);
            when(apiDocService.getExtensionTypes(false, "filter-page-count"))
                .thenReturn(List.of("pdf"));

            doReturn(new ResponseEntity<>(new byte[0], HttpStatus.OK))
                .when(pipelineProcessor)
                .sendWebRequest(anyString(), any());

            // Act
            PipelineResult result = pipelineProcessor.runPipelineAgainstFiles(files, config);

            // Assert
            assertTrue(result.isFiltersApplied(), "Filter flag should be true when operation filters file");
            assertFalse(result.isHasErrors(), "No errors should occur");
            assertTrue(result.getOutputFiles().isEmpty(), "Filtered file list should be empty");
        }
    }

    @Nested
    @DisplayName("Pipeline Execution without Filter Tests")
    class PipelineExecutionWithoutFilterTests {

        @Test
        @DisplayName("Does not set filtersApplied flag for non-filter operations")
        void runPipelineWithoutFilterDoesNotSetFlag() throws Exception {
            // Arrange
            PipelineOperation op = new PipelineOperation();
            op.setOperation("some-non-filter-operation");
            op.setParameters(Map.of());
            PipelineConfig config = new PipelineConfig();
            config.setOperations(List.of(op));

            Resource file = new ByteArrayResource("data".getBytes()) {
                @Override
                public String getFilename() {
                    return "test.pdf";
                }
            };

            List<Resource> files = List.of(file);

            when(apiDocService.isMultiInput("some-non-filter-operation")).thenReturn(false);
            when(apiDocService.getExtensionTypes(false, "some-non-filter-operation"))
                .thenReturn(List.of("pdf"));

            doReturn(new ResponseEntity<>(new byte[0], HttpStatus.OK))
                .when(pipelineProcessor)
                .sendWebRequest(anyString(), any());

            // Act
            PipelineResult result = pipelineProcessor.runPipelineAgainstFiles(files, config);

            // Assert
            assertFalse(result.isFiltersApplied(), "Filter flag should be false for non-filter operations");
            assertFalse(result.isHasErrors(), "No errors should occur");
            assertFalse(result.getOutputFiles().isEmpty(), "Output files should not be empty for non-filter operations");
        }
    }
}
