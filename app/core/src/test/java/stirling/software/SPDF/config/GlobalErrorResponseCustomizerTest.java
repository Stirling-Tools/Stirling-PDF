package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.PathItem;
import io.swagger.v3.oas.models.Paths;
import io.swagger.v3.oas.models.responses.ApiResponses;

class GlobalErrorResponseCustomizerTest {

    private GlobalErrorResponseCustomizer customizer;

    @BeforeEach
    void setUp() {
        customizer = new GlobalErrorResponseCustomizer();
    }

    @Test
    void customiseAddsErrorResponsesToApiV1PostOperation() {
        OpenAPI openApi = createOpenApiWithOperation("/api/v1/test", "post");
        customizer.customise(openApi);
        ApiResponses responses = openApi.getPaths().get("/api/v1/test").getPost().getResponses();
        assertTrue(responses.containsKey("400"));
        assertTrue(responses.containsKey("413"));
        assertTrue(responses.containsKey("422"));
        assertTrue(responses.containsKey("500"));
    }

    @Test
    void customiseAddsErrorResponsesToGetOperation() {
        OpenAPI openApi = createOpenApiWithOperation("/api/v1/test", "get");
        customizer.customise(openApi);
        ApiResponses responses = openApi.getPaths().get("/api/v1/test").getGet().getResponses();
        assertTrue(responses.containsKey("400"));
    }

    @Test
    void customiseDoesNotModifyNonApiPaths() {
        OpenAPI openApi = createOpenApiWithOperation("/other/path", "post");
        customizer.customise(openApi);
        ApiResponses responses = openApi.getPaths().get("/other/path").getPost().getResponses();
        assertFalse(responses.containsKey("400"));
    }

    @Test
    void customiseSkipsNullPaths() {
        OpenAPI openApi = new OpenAPI();
        assertDoesNotThrow(() -> customizer.customise(openApi));
    }

    @Test
    void customiseDoesNotOverwriteExistingErrorResponses() {
        OpenAPI openApi = createOpenApiWithOperation("/api/v1/test", "post");
        io.swagger.v3.oas.models.responses.ApiResponse custom400 =
                new io.swagger.v3.oas.models.responses.ApiResponse().description("Custom 400");
        openApi.getPaths()
                .get("/api/v1/test")
                .getPost()
                .getResponses()
                .addApiResponse("400", custom400);
        customizer.customise(openApi);
        assertEquals(
                "Custom 400",
                openApi.getPaths()
                        .get("/api/v1/test")
                        .getPost()
                        .getResponses()
                        .get("400")
                        .getDescription());
    }

    @Test
    void customiseHandlesPutPatchDelete() {
        OpenAPI openApi = new OpenAPI();
        Paths paths = new Paths();
        PathItem pathItem = new PathItem();

        Operation put = new Operation();
        put.setResponses(new ApiResponses());
        pathItem.setPut(put);

        Operation patch = new Operation();
        patch.setResponses(new ApiResponses());
        pathItem.setPatch(patch);

        Operation delete = new Operation();
        delete.setResponses(new ApiResponses());
        pathItem.setDelete(delete);

        paths.addPathItem("/api/v1/resource", pathItem);
        openApi.setPaths(paths);

        customizer.customise(openApi);

        assertTrue(put.getResponses().containsKey("400"));
        assertTrue(patch.getResponses().containsKey("413"));
        assertTrue(delete.getResponses().containsKey("500"));
    }

    @Test
    void customiseSkipsOperationWithNullResponses() {
        OpenAPI openApi = new OpenAPI();
        Paths paths = new Paths();
        PathItem pathItem = new PathItem();
        Operation post = new Operation();
        // responses is null
        pathItem.setPost(post);
        paths.addPathItem("/api/v1/test", pathItem);
        openApi.setPaths(paths);
        assertDoesNotThrow(() -> customizer.customise(openApi));
    }

    @Test
    void errorResponseDescriptionsAreCorrect() {
        OpenAPI openApi = createOpenApiWithOperation("/api/v1/test", "post");
        customizer.customise(openApi);
        ApiResponses responses = openApi.getPaths().get("/api/v1/test").getPost().getResponses();
        assertTrue(responses.get("400").getDescription().contains("Bad request"));
        assertTrue(responses.get("413").getDescription().contains("Payload too large"));
        assertTrue(responses.get("422").getDescription().contains("Unprocessable entity"));
        assertTrue(responses.get("500").getDescription().contains("Internal server error"));
    }

    private OpenAPI createOpenApiWithOperation(String path, String method) {
        OpenAPI openApi = new OpenAPI();
        Paths paths = new Paths();
        PathItem pathItem = new PathItem();
        Operation operation = new Operation();
        operation.setResponses(new ApiResponses());
        switch (method) {
            case "post" -> pathItem.setPost(operation);
            case "get" -> pathItem.setGet(operation);
            case "put" -> pathItem.setPut(operation);
            case "delete" -> pathItem.setDelete(operation);
        }
        paths.addPathItem(path, pathItem);
        openApi.setPaths(paths);
        return openApi;
    }
}
