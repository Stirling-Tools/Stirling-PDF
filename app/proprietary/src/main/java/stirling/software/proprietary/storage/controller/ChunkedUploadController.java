package stirling.software.proprietary.storage.controller;

import java.io.IOException;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.api.ChunkedUploadResponse;
import stirling.software.proprietary.storage.model.api.CreateChunkedUploadRequest;
import stirling.software.proprietary.storage.model.api.StoredFileResponse;
import stirling.software.proprietary.storage.service.ChunkedUploadService;
import stirling.software.proprietary.storage.service.FileStorageService;

/** Owner-scoped chunked upload; completion produces a temporary stored file. */
@RestController
@RequestMapping("/api/v1/storage/uploads")
@RequiredArgsConstructor
@Tag(name = "File Storage", description = "Stored file management, sharing, and uploads")
public class ChunkedUploadController {

    private final ChunkedUploadService chunkedUploadService;
    private final FileStorageService fileStorageService;

    @PostMapping(
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ChunkedUploadResponse create(@RequestBody CreateChunkedUploadRequest request) {
        return chunkedUploadService.create(requireUser(), request);
    }

    @PutMapping(
            value = "/{uploadId}/chunks/{index}",
            consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public ResponseEntity<Void> uploadChunk(
            @PathVariable UUID uploadId, @PathVariable int index, HttpServletRequest request)
            throws IOException {
        chunkedUploadService.storeChunk(
                requireUser(),
                uploadId,
                index,
                request.getInputStream(),
                request.getContentLengthLong());
        return ResponseEntity.noContent().build();
    }

    @PostMapping(value = "/{uploadId}/complete", produces = MediaType.APPLICATION_JSON_VALUE)
    public StoredFileResponse complete(@PathVariable UUID uploadId) {
        return chunkedUploadService.complete(requireUser(), uploadId);
    }

    @DeleteMapping("/{uploadId}")
    public ResponseEntity<Void> cancel(@PathVariable UUID uploadId) {
        chunkedUploadService.cancel(requireUser(), uploadId);
        return ResponseEntity.noContent().build();
    }

    private User requireUser() {
        User user = fileStorageService.requireAuthenticatedUser();
        if (user == null || user.getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }
        return user;
    }
}
