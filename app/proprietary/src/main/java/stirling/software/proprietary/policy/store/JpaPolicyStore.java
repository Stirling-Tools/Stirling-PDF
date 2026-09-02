package stirling.software.proprietary.policy.store;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.model.EditorConfig;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyBinding;
import stirling.software.proprietary.policy.source.EditorSource;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Durable {@link PolicyStore} backed by JPA; the runtime store. Policies are persisted as JSON via
 * {@link PolicyEntity}, with scalar columns kept in sync for querying.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JpaPolicyStore implements PolicyStore {

    private final PolicyRepository repository;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public Policy save(Policy policy) {
        String id =
                policy.id() == null || policy.id().isBlank()
                        ? UUID.randomUUID().toString()
                        : policy.id();
        Policy stored =
                new Policy(
                        id,
                        policy.name(),
                        policy.owner(),
                        policy.enabled(),
                        policy.inputs(),
                        policy.steps(),
                        policy.output(),
                        policy.outputIds(),
                        policy.teamId(),
                        policy.editor(),
                        policy.origin());

        PolicyEntity entity = new PolicyEntity();
        entity.setId(id);
        entity.setName(stored.name());
        entity.setOwner(stored.owner());
        entity.setEnabled(stored.enabled());
        entity.setTeamId(stored.teamId());
        // Preserve an existing policy's run-order position; append a new one to the end of its
        // team's queue (max + 1), so setting up a policy adds it last by default.
        entity.setSortOrder(
                repository
                        .findById(id)
                        .map(PolicyEntity::getSortOrder)
                        .orElseGet(() -> nextSortOrder(stored.teamId())));
        entity.setPolicyJson(objectMapper.writeValueAsString(stored));
        repository.save(entity);
        return stored;
    }

    /**
     * Append position for a new policy: max(existing) + 1, computed under a pessimistic lock on the
     * team's rows (see {@link PolicyRepository#findByTeamForUpdate}) so two concurrent creates
     * can't both read the same max and assign a duplicate order. (A brand-new team has no rows to
     * lock; a rare simultaneous first-create there ties at 0 — harmless, since the ordering query
     * breaks ties by id and any later reorder normalises it.)
     */
    private int nextSortOrder(Long teamId) {
        return repository.findByTeamForUpdate(teamId).stream()
                        .map(entity -> entity.getSortOrder() == null ? 0 : entity.getSortOrder())
                        .max(Integer::compareTo)
                        .orElse(-1)
                + 1;
    }

    @Override
    @Transactional
    public void reorder(Long teamId, List<String> orderedIds) {
        int position = 0;
        for (String id : orderedIds) {
            PolicyEntity entity = repository.findById(id).orElse(null);
            // Ignore unknown ids and any policy outside the caller's team — a reorder can't reach
            // across teams.
            if (entity == null || !Objects.equals(entity.getTeamId(), teamId)) {
                continue;
            }
            entity.setSortOrder(position++);
            repository.save(entity);
        }
    }

    @Override
    public Optional<Policy> get(String id) {
        return repository.findById(id).flatMap(this::toPolicy);
    }

    @Override
    public List<Policy> all() {
        return repository.findAllOrdered().stream()
                .map(this::toPolicy)
                .flatMap(Optional::stream)
                .toList();
    }

    @Override
    public List<Policy> findByTeam(Long teamId) {
        return repository.findByTeam(teamId).stream()
                .map(this::toPolicy)
                .flatMap(Optional::stream)
                .toList();
    }

    @Override
    public boolean anyPolicyReferences(String assetId) {
        return assetId != null && !assetId.isBlank() && repository.anyMentioning(assetId);
    }

    @Override
    public List<PolicyBinding> findBindingsByTriggerType(String triggerType) {
        List<Policy> enabled =
                repository.findByEnabledTrue().stream()
                        .map(this::toPolicy)
                        .flatMap(Optional::stream)
                        .toList();
        return PolicyBinding.matching(enabled, triggerType);
    }

    @Override
    public boolean delete(String id) {
        if (!repository.existsById(id)) {
            return false;
        }
        repository.deleteById(id);
        return true;
    }

    // Skip (don't fail) rows whose JSON can't be read - e.g. written by another app version/key.
    // One unreadable row must never abort a bulk read or crash startup.
    private Optional<Policy> toPolicy(PolicyEntity entity) {
        try {
            JsonNode node =
                    liftEditorConfig(
                            upgradeLegacyShape(objectMapper.readTree(entity.getPolicyJson())));
            return Optional.of(objectMapper.treeToValue(node, Policy.class));
        } catch (Exception e) {
            log.error(
                    "Skipping unreadable policy id={} name={}: stored JSON could not be parsed"
                            + " ({}). Likely written by a different app version or encryption key.",
                    entity.getId(),
                    entity.getName(),
                    e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Migrate a policy JSON blob written before triggers moved onto inputs. The old shape carried a
     * single policy-level {@code trigger} and a {@code sourceIds} list; pair each source with that
     * trigger so an upgraded policy keeps firing. A trigger incompatible with a source
     * (folder-watch on an S3 source) is simply inert at run time, matching the old behaviour where
     * such a source was never watched. New-shape blobs (already carrying {@code inputs}) are
     * returned untouched.
     */
    private JsonNode upgradeLegacyShape(JsonNode root) {
        if (!(root instanceof ObjectNode obj) || obj.has("inputs")) {
            return root;
        }
        JsonNode trigger = obj.get("trigger");
        JsonNode sourceIds = obj.get("sourceIds");
        ArrayNode inputs = objectMapper.createArrayNode();
        if (sourceIds != null && sourceIds.isArray()) {
            for (JsonNode sourceId : sourceIds) {
                ObjectNode input = objectMapper.createObjectNode();
                input.set("sourceId", sourceId);
                if (trigger != null && !trigger.isNull()) {
                    input.set("trigger", trigger);
                }
                inputs.add(input);
            }
        }
        obj.set("inputs", inputs);
        obj.remove("trigger");
        obj.remove("sourceIds");
        return obj;
    }

    /** Categories whose editor moment defaulted to export before it was stored (see runOn.ts). */
    private static final Set<String> EXPORT_BY_DEFAULT = Set.of("security");

    /**
     * Derive {@code editor} for a blob written before editor participation had its own field, from
     * its {@code output.options}: allowed when {@code sources} lists {@code "editor"}, or - for a
     * catalogue policy - when there is no {@code sources} list at all (an unnarrowed catalogue
     * policy runs in the editor).
     *
     * <p>Runs on every read, deliberately outside {@link #upgradeLegacyShape}'s early return: a
     * blob written after triggers moved onto {@code inputs} but before this field existed still
     * needs lifting, and that early return would skip exactly those rows.
     */
    private JsonNode liftEditorConfig(JsonNode root) {
        if (!(root instanceof ObjectNode obj) || obj.hasNonNull("editor")) {
            return root;
        }
        JsonNode options = obj.path("output").path("options");
        String categoryId = text(options, "categoryId");
        JsonNode sources = options.get("sources");
        boolean listed = sources != null && sources.isArray() && !sources.isEmpty();
        boolean allowed;
        if (listed) {
            // An explicit scope list decides: only the editor's own id puts it on the editor.
            allowed = false;
            for (JsonNode source : sources) {
                if (source.isValueNode() && EditorSource.ID.equals(source.asString())) {
                    allowed = true;
                    break;
                }
            }
        } else {
            // No list: a catalogue policy ran in the editor by default, but a builder pipeline
            // (no category) could not reach the editor at all, so silence is not consent there.
            allowed = !categoryId.isBlank();
        }
        ObjectNode editor = objectMapper.createObjectNode();
        editor.put("allowed", allowed);
        editor.put("runOn", legacyRunOn(options, categoryId));
        obj.set("editor", editor);
        return obj;
    }

    /** The stored moment, or the category default the client applied when none was stored. */
    private static String legacyRunOn(JsonNode options, String categoryId) {
        String stored = text(options, "runOn");
        if (EditorConfig.EXPORT.equals(stored) || EditorConfig.UPLOAD.equals(stored)) {
            return stored;
        }
        return EXPORT_BY_DEFAULT.contains(categoryId) ? EditorConfig.EXPORT : EditorConfig.UPLOAD;
    }

    private static String text(JsonNode parent, String field) {
        JsonNode node = parent.path(field);
        return node.isValueNode() ? node.asString() : "";
    }
}
