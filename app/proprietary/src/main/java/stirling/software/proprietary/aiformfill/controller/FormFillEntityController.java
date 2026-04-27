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
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.aiformfill.dto.FormFillEntityDTO;
import stirling.software.proprietary.aiformfill.dto.FormFillEntityImportRequest;
import stirling.software.proprietary.aiformfill.dto.FormFillEntityUpsertRequest;
import stirling.software.proprietary.aiformfill.service.FormFillEntityService;
import stirling.software.proprietary.security.model.User;

@RestController
@RequestMapping("/api/v1/ai-form-fill/entities")
@RequiredArgsConstructor
@Tag(
        name = "AI Form Fill — Entities",
        description =
                "Per-user persistent entities (person, company, site, etc.) used by AI form"
                        + " fill")
public class FormFillEntityController {

    private final FormFillEntityService service;

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public List<FormFillEntityDTO> list() {
        User user = service.requireAuthenticatedUser();
        return service.list(user).stream().map(FormFillEntityDTO::from).toList();
    }

    @GetMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public FormFillEntityDTO get(@PathVariable String id) {
        User user = service.requireAuthenticatedUser();
        return FormFillEntityDTO.from(service.get(user, id));
    }

    @PutMapping(
            value = "/{id}",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public FormFillEntityDTO upsert(
            @PathVariable String id, @Valid @RequestBody FormFillEntityUpsertRequest request) {
        User user = service.requireAuthenticatedUser();
        return FormFillEntityDTO.from(service.upsert(user, id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        User user = service.requireAuthenticatedUser();
        service.delete(user, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(
            value = "/import",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public List<FormFillEntityDTO> importBatch(
            @Valid @RequestBody FormFillEntityImportRequest request) {
        User user = service.requireAuthenticatedUser();
        return service.importBatch(user, request).stream().map(FormFillEntityDTO::from).toList();
    }
}
