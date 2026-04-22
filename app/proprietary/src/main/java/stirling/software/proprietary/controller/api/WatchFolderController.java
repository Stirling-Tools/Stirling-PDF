package stirling.software.proprietary.controller.api;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.model.WatchFolder;
import stirling.software.proprietary.model.WatchFolderFile;
import stirling.software.proprietary.model.WatchFolderRun;
import stirling.software.proprietary.service.WatchFolderService;

@RestController
@RequestMapping("/api/v1/watch-folders")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class WatchFolderController {

    /** Upper bound for /runs/batch payloads, to stop a single request from inserting millions. */
    private static final int RUNS_BATCH_MAX = 500;

    private final WatchFolderService service;

    // ── Folder CRUD ────────────────────────────────────────────────────────

    @GetMapping
    public List<WatchFolder> list() {
        return service.listFolders();
    }

    @GetMapping("/{id}")
    public ResponseEntity<WatchFolder> get(@PathVariable String id) {
        return service.getFolder(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<WatchFolder> create(@Valid @RequestBody WatchFolder folder) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createFolder(folder));
    }

    @PutMapping("/{id}")
    public ResponseEntity<WatchFolder> update(
            @PathVariable String id, @Valid @RequestBody WatchFolder folder) {
        return ResponseEntity.ok(service.updateFolder(id, folder));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.deleteFolder(id);
        return ResponseEntity.noContent().build();
    }

    // ── Folder files ───────────────────────────────────────────────────────

    @GetMapping("/{folderId}/files")
    public List<WatchFolderFile> listFiles(@PathVariable String folderId) {
        return service.listFiles(folderId);
    }

    @PutMapping("/{folderId}/files")
    public WatchFolderFile upsertFile(
            @PathVariable String folderId, @Valid @RequestBody WatchFolderFile file) {
        return service.upsertFile(folderId, file);
    }

    @DeleteMapping("/{folderId}/files")
    public ResponseEntity<Void> deleteFiles(@PathVariable String folderId) {
        service.deleteFiles(folderId);
        return ResponseEntity.noContent().build();
    }

    // ── Folder runs ────────────────────────────────────────────────────────

    @GetMapping("/{folderId}/runs")
    public List<WatchFolderRun> listRuns(@PathVariable String folderId) {
        return service.listRuns(folderId);
    }

    @PostMapping("/{folderId}/runs")
    public ResponseEntity<WatchFolderRun> addRun(
            @PathVariable String folderId, @Valid @RequestBody WatchFolderRun run) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.addRun(folderId, run));
    }

    @PostMapping("/{folderId}/runs/batch")
    public ResponseEntity<List<WatchFolderRun>> addRuns(
            @PathVariable String folderId,
            @Valid @RequestBody @Size(max = RUNS_BATCH_MAX) List<WatchFolderRun> runs) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.addRuns(folderId, runs));
    }
}
