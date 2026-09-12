package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Field;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.servlet.ServletContext;

import stirling.software.SPDF.model.ApiEndpoint;
import stirling.software.common.service.UserServiceInterface;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Input/output type behaviour used to live here, parsed out of the description prose. It is now
 * declared with {@code @ToolIO} and covered by {@code ToolIORegistryTest} and {@code
 * ToolIODeclarationCoverageTest}.
 */
@ExtendWith(MockitoExtension.class)
class ApiDocServiceTest {

    @Mock ServletContext servletContext;
    @Mock UserServiceInterface userService;

    ApiDocService apiDocService;
    ObjectMapper mapper = JsonMapper.builder().build();

    @BeforeEach
    void setUp() {
        apiDocService = new ApiDocService(mapper, servletContext, userService);
    }

    private void setApiDocumentation(Map<String, ApiEndpoint> docs) throws Exception {
        Field field = ApiDocService.class.getDeclaredField("apiDocumentation");
        field.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, ApiEndpoint> map = (Map<String, ApiEndpoint>) field.get(apiDocService);
        map.clear();
        map.putAll(docs);
    }

    private void setApiDocsJsonRootNode() throws Exception {
        Field field = ApiDocService.class.getDeclaredField("apiDocsJsonRootNode");
        field.setAccessible(true);
        field.set(apiDocService, mapper.createObjectNode());
    }

    @Test
    void isValidOperationChecksRequiredParameters() throws Exception {
        String json =
                "{\"description\": \"desc\", \"parameters\": [{\"name\":\"param1\", \"required\":"
                        + " true}, {\"name\":\"param2\", \"required\": true}]}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/op", postNode);
        setApiDocumentation(Map.of("/op", endpoint));
        setApiDocsJsonRootNode();
        assertTrue(apiDocService.isValidOperation("/op", Map.of("param1", "a", "param2", "b")));
        assertFalse(apiDocService.isValidOperation("/op", Map.of("param1", "a")));
        assertFalse(apiDocService.isValidOperation("/op", Map.of("param2", "b")));
    }

    @Test
    void isValidOperationAllowsOptionalParameters() throws Exception {
        String json =
                "{\"description\": \"desc\", \"parameters\": [{\"name\":\"param1\", \"required\":"
                        + " false}, {\"name\":\"param2\", \"required\": false}]}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/op", postNode);
        setApiDocumentation(Map.of("/op", endpoint));
        setApiDocsJsonRootNode();
        assertTrue(apiDocService.isValidOperation("/op", Map.of("param1", "a", "param2", "b")));
        assertTrue(apiDocService.isValidOperation("/op", Map.of("param1", "a")));
        assertTrue(apiDocService.isValidOperation("/op", Map.of()));
    }

    @Test
    void isValidOperationHandlesUnknownOperation() throws Exception {
        setApiDocumentation(Map.of());
        assertFalse(apiDocService.isValidOperation("/unknown", Map.of("param1", "a")));
    }

    @Test
    void isValidOperationWithEmptyParameters() throws Exception {
        String json = "{\"description\": \"desc\", \"parameters\": []}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/empty", postNode);
        setApiDocumentation(Map.of("/empty", endpoint));
        setApiDocsJsonRootNode();
        assertTrue(apiDocService.isValidOperation("/empty", Map.of()));
        assertTrue(apiDocService.isValidOperation("/empty", Map.of("extra", "value")));
    }

    @Test
    void isValidOperationWithMixedRequiredAndOptional() throws Exception {
        String json =
                "{\"description\": \"desc\", \"parameters\": [{\"name\":\"required1\","
                        + " \"required\": true}, {\"name\":\"optional1\", \"required\": false}]}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/mixed", postNode);
        setApiDocumentation(Map.of("/mixed", endpoint));
        setApiDocsJsonRootNode();
        assertTrue(
                apiDocService.isValidOperation(
                        "/mixed", Map.of("required1", "a", "optional1", "b")));
        assertTrue(apiDocService.isValidOperation("/mixed", Map.of("required1", "a")));
        assertFalse(apiDocService.isValidOperation("/mixed", Map.of("optional1", "b")));
        assertFalse(apiDocService.isValidOperation("/mixed", Map.of()));
    }

    @Test
    void constructorAcceptsNullUserService() {
        ApiDocService service = new ApiDocService(mapper, servletContext, null);
        assertNotNull(service);
    }
}
