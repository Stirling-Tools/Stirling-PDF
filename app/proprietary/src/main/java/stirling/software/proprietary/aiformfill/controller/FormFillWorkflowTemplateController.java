package stirling.software.proprietary.aiformfill.controller;

import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.aiformfill.dto.FormFillWorkflowTemplateDTO;
import stirling.software.proprietary.aiformfill.dto.FormFillWorkflowTemplateUpsertRequest;
import stirling.software.proprietary.aiformfill.service.FormFillEntityService;
import stirling.software.proprietary.aiformfill.service.FormFillWorkflowTemplateService;
import stirling.software.proprietary.security.model.User;

@RestController
@RequestMapping("/api/v1/ai-form-fill/workflow-templates")
@RequiredArgsConstructor
@Tag(
        name = "AI Form Fill — Workflow Templates",
        description = "Per-user saved role→entity mappings keyed by form signature")
public class FormFillWorkflowTemplateController {

    private final FormFillWorkflowTemplateService service;
    private final FormFillEntityService entityService;

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public List<FormFillWorkflowTemplateDTO> list() {
        User user = entityService.requireAuthenticatedUser();
        return service.list(user).stream().map(FormFillWorkflowTemplateDTO::from).toList();
    }

    @GetMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public FormFillWorkflowTemplateDTO get(@PathVariable String id) {
        User user = entityService.requireAuthenticatedUser();
        return FormFillWorkflowTemplateDTO.from(service.get(user, id));
    }

    @GetMapping(params = "signature", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<FormFillWorkflowTemplateDTO> findBySignature(
            @RequestParam("signature") String signature) {
        User user = entityService.requireAuthenticatedUser();
        return service.findBySignature(user, signature)
                .map(FormFillWorkflowTemplateDTO::from)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping(
            value = "/{id}",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public FormFillWorkflowTemplateDTO upsert(
            @PathVariable String id,
            @Valid @RequestBody FormFillWorkflowTemplateUpsertRequest request) {
        User user = entityService.requireAuthenticatedUser();
        return FormFillWorkflowTemplateDTO.from(service.upsert(user, id, request));
    }

    @PostMapping(value = "/{id}/touch", produces = MediaType.APPLICATION_JSON_VALUE)
    public FormFillWorkflowTemplateDTO touch(@PathVariable String id) {
        User user = entityService.requireAuthenticatedUser();
        return FormFillWorkflowTemplateDTO.from(service.touchLastUsed(user, id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        User user = entityService.requireAuthenticatedUser();
        service.delete(user, id);
        return ResponseEntity.noContent().build();
    }
}
