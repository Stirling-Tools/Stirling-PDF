package stirling.software.SPDF.service.xfa;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDChoice;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.w3c.dom.Element;

import stirling.software.SPDF.service.xfa.XfaDatasets.Target;
import stirling.software.SPDF.service.xfa.XfaSyncReport.FieldResult;
import stirling.software.SPDF.service.xfa.XfaSyncReport.Note;
import stirling.software.SPDF.service.xfa.XfaSyncReport.Status;
import stirling.software.SPDF.service.xfa.XfaTemplate.Container;
import stirling.software.SPDF.service.xfa.XfaTemplate.Kind;
import stirling.software.SPDF.service.xfa.XfaTemplate.Match;
import stirling.software.SPDF.service.xfa.XfaTemplate.Step;
import stirling.software.common.util.FormUtils;

/**
 * Copies every AcroForm field value into the XFA datasets packet of one hybrid form.
 *
 * <p>Fields are bound in form order, the depth-first order of their template path, because that is
 * the order in which XFA hands out same-named data nodes. Fields that share one data node (global
 * bindings, master-page copies) are settled together: Acrobat can only show one value for all of
 * them, so the winner is written and copied back to the other AcroForm fields.
 */
final class XfaDataSync {

    /** Values a formatted field may take in the data untouched: empty, a number, an ISO date. */
    private static final Pattern CANONICAL =
            Pattern.compile(
                    "|[+-]?\\d+(\\.\\d+)?"
                            + "|\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?)?"
                            + "|\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?");

    private record Entry(
            PDTerminalField field, String name, SomPath path, List<Step> chain, int order) {

        Container container() {
            return chain == null ? null : chain.getLast().container();
        }
    }

    private static final class Plan {
        final Entry entry;
        final XfaFieldValues.Value value;
        final List<Note> notes;
        final boolean edited;
        Target target;
        Status status;
        String previous;
        String after;

        Plan(Entry entry, XfaFieldValues.Value value, boolean edited) {
            this.entry = entry;
            this.value = value;
            this.notes = new ArrayList<>(value.notes());
            this.edited = edited;
        }

        String text() {
            return value.text();
        }
    }

    private final PDDocument document;
    private final XfaTemplate template;
    private final XfaDatasets data;
    private final XfaInspection before;
    private final Set<String> changedFields;
    private final List<String> warnings;
    private final Map<String, Target> scopes = new HashMap<>();

    private XfaDataSync(
            PDDocument document,
            XfaTemplate template,
            XfaDatasets data,
            XfaInspection before,
            Set<String> changedFields,
            List<String> warnings) {
        this.document = document;
        this.template = template;
        this.data = data;
        this.before = before;
        this.changedFields = changedFields;
        this.warnings = warnings;
    }

    /**
     * @param changedFields fully qualified names the caller edited, on top of those the {@code
     *     before} snapshot shows changing
     * @param warnings collects what the caller should know but that did not stop the sync
     * @throws IOException when the datasets packet cannot be read, or would not parse once written
     */
    static List<FieldResult> run(
            PDDocument document,
            PDAcroForm acroForm,
            XfaInspection before,
            Set<String> changedFields,
            List<String> warnings)
            throws IOException {
        XfaPackets packets = XfaPackets.of(document, acroForm);
        Element templateElement = packets.template();
        XfaTemplate template = templateElement == null ? null : XfaTemplate.parse(templateElement);
        if (template == null) {
            warnings.add(
                    "The XFA has no readable template, so fields were matched to data by name"
                            + " only.");
        }
        XfaPackets.Datasets datasets = packets.datasets();
        XfaDatasets data =
                new XfaDatasets(datasets.element(), template == null ? null : template.rootName());
        if (data.recordCount() > 1) {
            warnings.add(
                    "The XFA data holds "
                            + data.recordCount()
                            + " records; only the first was brought in line.");
        }
        List<FieldResult> results =
                new XfaDataSync(document, template, data, before, changedFields, warnings)
                        .sync(acroForm);
        if (data.changed()) {
            packets.write(datasets);
        }
        return results;
    }

    private List<FieldResult> sync(PDAcroForm acroForm) throws IOException {
        List<Entry> entries = new ArrayList<>();
        for (PDField field : acroForm.getFieldTree()) {
            if (field instanceof PDTerminalField terminal
                    && field.getFullyQualifiedName() != null) {
                String name = field.getFullyQualifiedName();
                SomPath path = SomPath.parse(name);
                List<Step> chain =
                        template == null || path.tokens().isEmpty()
                                ? null
                                : template.resolve(path).orElse(null);
                entries.add(new Entry(terminal, name, path, chain, entries.size()));
            }
        }
        List<Entry> formOrder = new ArrayList<>(entries);
        formOrder.sort(XfaDataSync::compareFormOrder);

        Map<Entry, Plan> plans = new IdentityHashMap<>();
        Map<Target, List<Plan>> byTarget = new LinkedHashMap<>();
        for (Entry entry : formOrder) {
            Plan plan = plan(entry);
            plans.put(entry, plan);
            if (plan.status == null) {
                byTarget.computeIfAbsent(plan.target, key -> new ArrayList<>()).add(plan);
            } else {
                plan.after = plan.previous;
            }
        }
        Map<String, Object> copyBack = new LinkedHashMap<>();
        byTarget.forEach((target, sharers) -> settle(target, sharers, copyBack));
        if (!copyBack.isEmpty()) {
            FormUtils.applyFieldValues(document, copyBack, false);
        }
        List<FieldResult> results = new ArrayList<>(entries.size());
        for (Entry entry : entries) {
            results.add(result(plans.get(entry)));
        }
        return results;
    }

    private Plan plan(Entry entry) {
        Container container = entry.container();
        XfaFieldValues.Value value = XfaFieldValues.read(entry.field(), container);
        Plan plan = new Plan(entry, value, isEdited(entry));
        if (container != null && container.calculated) {
            plan.notes.add(Note.CALCULATED);
        }
        if (value.skipped() != null) {
            plan.status = value.skipped();
            return plan;
        }
        if (entry.chain() != null) {
            bind(plan, entry.chain());
        } else {
            plan.notes.add(Note.FALLBACK);
            Optional<Element> found = data.fallback(entry.path());
            plan.target = found.map(data::target).orElse(null);
            if (plan.target == null) {
                plan.status = Status.NOT_FOUND;
            }
        }
        if (plan.target != null && plan.target.exists()) {
            plan.previous = data.read(plan.target.element());
        }
        if (plan.status == null
                && container != null
                && container.formatted
                && !plan.edited
                && !CANONICAL.matcher(plan.text()).matches()) {
            plan.status = Status.SKIPPED_FORMATTED;
        }
        return plan;
    }

    private void bind(Plan plan, List<Step> chain) {
        Target scope = data.record();
        StringBuilder key = new StringBuilder();
        for (int i = 1; i < chain.size() - 1 && scope != null; i++) {
            Step step = chain.get(i);
            key.append('/').append(step.container().ordinal).append('#').append(step.instance());
            Target known = scopes.get(key.toString());
            if (known == null) {
                known = enter(scope, step.container());
                if (known != null) {
                    scopes.put(key.toString(), known);
                } else if (step.container().match == Match.DATA_REF) {
                    plan.notes.add(Note.UNSUPPORTED_REF);
                }
            }
            scope = known;
        }
        Container field = chain.getLast().container();
        if (scope == null) {
            plan.status = Status.NOT_FOUND;
            return;
        }
        switch (field.match) {
            case NONE -> plan.status = Status.UNBOUND;
            case GLOBAL -> plan.target = data.global(scope, field.name);
            case DATA_REF -> {
                plan.target = data.dataRef(scope, field.ref, true).orElse(null);
                if (plan.target == null) {
                    plan.notes.add(Note.UNSUPPORTED_REF);
                }
            }
            case ONCE -> {
                if (field.name == null) {
                    plan.status = Status.UNBOUND;
                } else {
                    plan.target = data.value(scope, field.name);
                }
            }
        }
        if (plan.status == null && plan.target == null) {
            plan.status = Status.NOT_FOUND;
        }
    }

    /** The data scope inside {@code container}: its own group for a named, bound subform. */
    private Target enter(Target scope, Container container) {
        if (container.kind != Kind.SUBFORM
                || container.name == null
                || container.match == Match.NONE) {
            return scope;
        }
        if (container.match == Match.DATA_REF) {
            return data.dataRef(scope, container.ref, false).orElse(null);
        }
        return data.group(scope, container.name);
    }

    /** Writes one data node on behalf of every field bound to it. */
    private void settle(Target target, List<Plan> sharers, Map<String, Object> copyBack) {
        String current = target.exists() ? data.read(target.element()) : null;
        Plan winner = winner(sharers, current);
        String after = winner.text();
        boolean created = !target.exists();
        boolean write = created ? !isEmptyOrOff(winner, after) : !after.equals(current);
        if (write) {
            data.write(target, after);
        }
        for (Plan plan : sharers) {
            plan.after = write ? after : current;
            if (plan != winner && !plan.text().equals(after)) {
                plan.status = Status.CONFLICT_RESOLVED;
                copyBack(plan, winner, after, copyBack);
            } else if (!write) {
                plan.status = Status.UNCHANGED;
            } else {
                plan.status = created ? Status.CREATED : Status.UPDATED;
            }
        }
    }

    /**
     * When the fields disagree, the value the caller edited wins; failing that, the one that
     * differs from the stored data, since the fields still holding it are the stale copies.
     */
    private static Plan winner(List<Plan> sharers, String current) {
        if (sharers.stream().map(Plan::text).distinct().count() <= 1) {
            return sharers.getFirst();
        }
        for (Plan plan : sharers) {
            if (plan.edited) {
                return plan;
            }
        }
        String stored = current == null ? "" : current;
        for (Plan plan : sharers) {
            if (!plan.text().equals(stored)) {
                return plan;
            }
        }
        return sharers.getFirst();
    }

    private void copyBack(Plan loser, Plan winner, String after, Map<String, Object> copyBack) {
        PDTerminalField field = loser.entry.field();
        if (field instanceof PDTextField) {
            copyBack.put(loser.entry.name(), after);
        } else if (field instanceof PDChoice && winner.entry.field() instanceof PDChoice source) {
            copyBack.put(loser.entry.name(), String.join(",", source.getValue()));
        } else if (XfaFieldValues.isCheckbox(field, loser.entry.container())) {
            Container container = loser.entry.container();
            String on = container == null ? "1" : container.onValue();
            copyBack.put(loser.entry.name(), after.equals(on) ? "true" : "Off");
        } else {
            warnings.add(
                    "Fields sharing the XFA value "
                            + data.pathOf(loser.target)
                            + " disagree; Acrobat will show the value of "
                            + winner.entry.name()
                            + ".");
        }
    }

    /** Acrobat reads a missing data node as empty or unchecked, so none needs creating. */
    private static boolean isEmptyOrOff(Plan plan, String value) {
        if (value.isEmpty()) {
            return true;
        }
        Container container = plan.entry.container();
        return "checkbox".equals(plan.value.kind())
                && container != null
                && value.equals(container.offValue());
    }

    private boolean isEdited(Entry entry) {
        if (changedFields.contains(entry.name())) {
            return true;
        }
        String previous = before.valuesBefore().get(entry.name());
        return previous == null || !previous.equals(XfaFieldValues.stateOf(entry.field()));
    }

    private FieldResult result(Plan plan) {
        boolean secret = plan.value.isSecret();
        return new FieldResult(
                plan.entry.name(),
                plan.target == null ? null : data.pathOf(plan.target),
                plan.value.kind(),
                secret ? null : plan.text(),
                secret ? null : plan.previous,
                secret ? null : plan.after,
                plan.status,
                List.copyOf(plan.notes));
    }

    private static int compareFormOrder(Entry left, Entry right) {
        if (left.chain() == null || right.chain() == null) {
            if (left.chain() == right.chain()) {
                return Integer.compare(left.order(), right.order());
            }
            return left.chain() == null ? 1 : -1;
        }
        List<Step> a = left.chain();
        List<Step> b = right.chain();
        for (int i = 0; i < Math.min(a.size(), b.size()); i++) {
            int byNode =
                    Integer.compare(a.get(i).container().ordinal, b.get(i).container().ordinal);
            if (byNode != 0) {
                return byNode;
            }
            int byInstance = Integer.compare(a.get(i).instance(), b.get(i).instance());
            if (byInstance != 0) {
                return byInstance;
            }
        }
        int bySize = Integer.compare(a.size(), b.size());
        return bySize != 0 ? bySize : Integer.compare(left.order(), right.order());
    }
}
