/**
 * AI Form Fill tool — analyses forms (role detection, label cleanup) then fills using
 * entities. Multi-entity-per-role expands into multiple filled outputs in one go: pick
 * three "Client" entities and the same source PDF will produce three filled copies.
 *
 * Runs in `fileEditor` workbench so the multiple outputs surface as separate files.
 */
import { useMemo, useCallback, useState } from 'react';
import {
  Stack,
  Text,
  Button,
  Loader,
  Alert,
  Badge,
  Divider,
  Group,
  Select,
  SegmentedControl,
  Checkbox,
  TextInput,
  Collapse,
  ActionIcon,
  ScrollArea,
  Switch,
  Tooltip,
} from '@mantine/core';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useTranslation } from 'react-i18next';
import { useFileSelection, useFileState } from '@app/contexts/FileContext';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { isStirlingFile } from '@app/types/fileContext';
import type { FileId } from '@app/types/file';
import type { BaseToolProps, ToolComponent } from '@app/types/tool';
import { useKnowledgeStore } from './useKnowledgeStore';
import { useFormAnalysis } from './useFormAnalysis';
import { useBatchFormFillFlow } from './useBatchFormFillFlow';
import { ProfileManagementModal } from './ProfileManagementModal';
import { RoleSection } from './RoleSection';
import type { CleanedLabel } from './types';
import styles from './AiFormFill.module.css';

const AiFormFill = (_props: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectors, state: fileState } = useFileState();
  const { setSelectedFiles } = useFileSelection();
  const { handleToolSelect } = useToolWorkflow();
  const knowledge = useKnowledgeStore();
  const analysis = useFormAnalysis(knowledge);
  const batchFill = useBatchFormFillFlow(analysis, knowledge);
  const [modalOpened, setModalOpened] = useState(false);
  const [viewMode, setViewMode] = useState<string>('roles');
  const [pairMode, setPairMode] = useState(false);
  const [expandedReview, setExpandedReview] = useState<Record<string, boolean>>({});

  const openInFormFiller = useCallback(
    (outputFileId: string | null) => {
      if (outputFileId) {
        setSelectedFiles([outputFileId as FileId]);
      }
      handleToolSelect('formFill');
    },
    [setSelectedFiles, handleToolSelect],
  );

  const allFiles = useMemo(
    () => selectors.getFiles().filter((f) => isStirlingFile(f)),
    [selectors, fileState.files.ids],
  );

  const fileNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of allFiles) {
      if (isStirlingFile(f)) map[f.fileId] = f.name;
    }
    return map;
  }, [allFiles]);

  const handleAnalyse = useCallback(() => {
    if (allFiles.length > 0) {
      analysis.analyseAllFiles(allFiles as any);
    }
  }, [allFiles, analysis.analyseAllFiles]);

  const handleFill = useCallback(() => {
    if (allFiles.length > 0) {
      batchFill.fillAllFiles(allFiles as any, pairMode);
    }
  }, [allFiles, batchFill.fillAllFiles, pairMode]);

  const handleReset = useCallback(() => {
    analysis.reset();
    batchFill.reset();
  }, [analysis.reset, batchFill.reset]);

  const modal = <ProfileManagementModal opened={modalOpened} onClose={() => setModalOpened(false)} knowledge={knowledge} />;

  // Build lookup maps from analysis
  const cleanedLabelsByFile = useMemo(() => {
    const map: Record<string, CleanedLabel[]> = {};
    for (const pf of analysis.analysis?.perFile || []) {
      map[pf.fileId] = pf.cleanedLabels;
    }
    return map;
  }, [analysis.analysis]);

  const skippedFieldsByFile = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const pf of analysis.analysis?.perFile || []) {
      map[pf.fileId] = new Set(pf.skippedFieldNames);
    }
    return map;
  }, [analysis.analysis]);

  // ── Idle / Setup ──
  if (analysis.phase === 'idle' || analysis.phase === 'error') {
    return (
      <>{modal}
      <div className={styles.root}>
        <div className={styles.header}>
          <Group gap={8} mb="xs">
            <AutoAwesomeIcon sx={{ fontSize: 20 }} />
            <Text fw={600} size="sm">{t('aiFormFill.title', 'AI Form Fill')}</Text>
          </Group>
          <Group gap={6}>
            <Select
              size="xs"
              data={knowledge.profileNames}
              value={knowledge.activeProfileName}
              onChange={(v) => v && knowledge.setActiveProfile(v)}
              styles={{ input: { fontSize: '0.8125rem' } }}
              style={{ flex: 1 }}
            />
            <Badge size="sm" variant="light">{knowledge.entryCount}</Badge>
            <Button variant="subtle" size="compact-xs" onClick={() => setModalOpened(true)}>
              Manage
            </Button>
          </Group>
        </div>
        <div className={styles.content}>
          <Stack gap="md">
            {analysis.error && (
              <Alert icon={<WarningAmberIcon />} color="red" variant="light">{analysis.error}</Alert>
            )}
            {allFiles.length > 0 ? (
              <Text size="sm" c="dimmed">
                {`${allFiles.length} file${allFiles.length > 1 ? 's' : ''} loaded. Analyse to detect form roles and fields.`}
              </Text>
            ) : (
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  No PDF loaded yet.
                </Text>
                <Text size="xs" c="dimmed">
                  Drop a PDF form onto the canvas (or click the &quot;+&quot; tile in the file
                  list) to load it. Once loaded, Analyse Forms will light up.
                </Text>
              </Stack>
            )}
          </Stack>
        </div>
        <div className={styles.footer}>
          <Button
            fullWidth
            leftSection={<AnalyticsIcon sx={{ fontSize: 18 }} />}
            onClick={handleAnalyse}
            disabled={allFiles.length === 0}
          >
            Analyse Forms
          </Button>
        </div>
      </div>
      </>
    );
  }

  // ── Fetching fields / Analysing ──
  if (analysis.phase === 'fetching_fields' || analysis.phase === 'analysing') {
    return (
      <>{modal}
      <div className={styles.root}>
        <div className={styles.content} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text size="sm" c="dimmed">
              {analysis.phase === 'fetching_fields'
                ? 'Extracting form fields...'
                : 'AI is analysing your forms...'}
            </Text>
          </Stack>
        </div>
      </div>
      </>
    );
  }

  // ── Filling / Applying ──
  if (batchFill.phase === 'filling' || batchFill.phase === 'applying') {
    const planned = batchFill.plannedVariantCount;
    return (
      <>{modal}
      <div className={styles.root}>
        <div className={styles.content} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text size="sm" c="dimmed">
              {batchFill.phase === 'filling'
                ? `AI is filling ${planned ?? ''} ${planned === 1 ? 'variant' : 'variants'}...`.replace(/  +/g, ' ').trim()
                : 'Writing filled PDFs...'}
            </Text>
          </Stack>
        </div>
      </div>
      </>
    );
  }

  // ── Review ──
  if (batchFill.phase === 'review') {
    const proposed = batchFill.proposed;
    const acceptedVariants = proposed.filter((v) => v.accepted);
    const totalAcceptedFills = acceptedVariants.reduce(
      (n, v) => n + v.fills.filter((f) => f.accepted).length,
      0,
    );
    const totalProposedFills = proposed.reduce((n, v) => n + v.fills.length, 0);

    return (
      <>{modal}
      <div className={styles.root}>
        <div className={styles.header}>
          <Group gap={8} mb="xs">
            <AutoAwesomeIcon sx={{ fontSize: 20 }} />
            <Text fw={600} size="sm">Review Fills</Text>
          </Group>
          <Text size="xs" c="dimmed">
            {proposed.length} variant{proposed.length === 1 ? '' : 's'} · {totalAcceptedFills}/{totalProposedFills} fields will be applied
          </Text>
          {batchFill.message && (
            <Text size="xs" c="dimmed" mt={2}>{batchFill.message}</Text>
          )}
        </div>
        <ScrollArea className={styles.content} type="auto">
          <Stack gap="xs">
            {proposed.map((v) => {
              const isExpanded = expandedReview[v.variantId] ?? proposed.length === 1;
              const acceptedFills = v.fills.filter((f) => f.accepted).length;
              const totalFills = v.fills.length;
              const unfilledCount = v.unfilledFieldNames.length;
              return (
                <Stack
                  key={v.variantId}
                  gap={4}
                  p="xs"
                  style={{
                    border: '1px solid var(--mantine-color-default-border)',
                    borderRadius: 'var(--mantine-radius-sm)',
                    opacity: v.accepted ? 1 : 0.55,
                  }}
                >
                  <Group gap={6} wrap="nowrap">
                    <Checkbox
                      size="xs"
                      checked={v.accepted}
                      onChange={() => batchFill.toggleVariant(v.variantId)}
                    />
                    <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                      <Text size="xs" fw={600} truncate>{v.outputFileName}</Text>
                      <Text size="xs" c="dimmed">
                        {v.entityNames.join(' + ')}
                      </Text>
                    </Stack>
                    <Badge size="xs" variant="light" color={unfilledCount === 0 ? 'green' : 'blue'}>
                      {acceptedFills}/{v.totalFillableCount}
                    </Badge>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      onClick={() =>
                        setExpandedReview((prev) => ({
                          ...prev,
                          [v.variantId]: !isExpanded,
                        }))
                      }
                      aria-label={isExpanded ? 'Hide details' : 'Show details'}
                    >
                      {isExpanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                    </ActionIcon>
                  </Group>
                  <Collapse in={isExpanded}>
                    <Stack gap={4} mt={4}>
                      {v.fills.map((f) => (
                        <Group key={f.fieldName} gap={6} wrap="nowrap" align="flex-start">
                          <Checkbox
                            size="xs"
                            checked={f.accepted && v.accepted}
                            disabled={!v.accepted}
                            onChange={() => batchFill.toggleFill(v.variantId, f.fieldName)}
                            mt={4}
                          />
                          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                            <Group gap={4} wrap="nowrap">
                              <Text size="xs" c="dimmed" truncate style={{ flex: 1 }}>
                                {f.label}
                              </Text>
                              {f.edited && (
                                <Badge size="xs" variant="light" color="yellow">
                                  edited
                                </Badge>
                              )}
                              <Badge size="xs" variant="outline">
                                {f.entityName}
                              </Badge>
                            </Group>
                            <TextInput
                              size="xs"
                              value={f.value}
                              onChange={(e) =>
                                batchFill.editFill(v.variantId, f.fieldName, e.currentTarget.value)
                              }
                              disabled={!v.accepted}
                              styles={{ input: { fontSize: '0.75rem', minHeight: 24 } }}
                            />
                          </Stack>
                        </Group>
                      ))}
                      {unfilledCount > 0 && (
                        <Stack gap={2} mt={4} pl={28}>
                          <Text size="xs" c="dimmed" fw={500}>
                            Unfilled ({unfilledCount}) — finish manually after apply:
                          </Text>
                          {v.unfilledFieldNames.map((name) => (
                            <Text key={name} size="xs" c="dimmed" pl={4}>
                              · {v.labelByFieldName[name] ?? name}
                            </Text>
                          ))}
                        </Stack>
                      )}
                    </Stack>
                  </Collapse>
                </Stack>
              );
            })}
          </Stack>
        </ScrollArea>
        <div className={styles.footer}>
          <Group gap="xs">
            <Button variant="subtle" size="xs" onClick={batchFill.cancelReview}>
              Cancel
            </Button>
            <Button
              size="xs"
              style={{ flex: 1 }}
              onClick={batchFill.applyProposed}
              disabled={totalAcceptedFills === 0}
            >
              Apply {totalAcceptedFills} field{totalAcceptedFills === 1 ? '' : 's'} to {acceptedVariants.length} file{acceptedVariants.length === 1 ? '' : 's'}
            </Button>
          </Group>
        </div>
      </div>
      </>
    );
  }

  // ── Done ──
  if (batchFill.phase === 'done') {
    const anyPartial = batchFill.results.some(
      (r) => r.filledFieldCount < r.totalFillableCount,
    );
    return (
      <>{modal}
      <div className={styles.root}>
        <div className={styles.header}>
          <Group gap={8} mb="xs">
            <CheckCircleIcon sx={{ fontSize: 20, color: 'var(--mantine-color-green-6)' }} />
            <Text fw={600} size="sm">Fill Complete</Text>
          </Group>
        </div>
        <div className={styles.content}>
          <Stack gap="sm">
            <Text size="sm">
              Generated {batchFill.results.length} filled file{batchFill.results.length === 1 ? '' : 's'}.
            </Text>
            {batchFill.message && <Text size="xs" c="dimmed">{batchFill.message}</Text>}
            {anyPartial && (
              <Alert color="blue" variant="light" p="xs" icon={<WarningAmberIcon />}>
                <Text size="xs">
                  Some fields are still empty — likely because your entities don&apos;t cover them yet.
                  Click &quot;Finish in Form Fill&quot; on a file to complete it manually.
                </Text>
              </Alert>
            )}
            <Divider />
            <Stack gap={6}>
              {batchFill.results.map((r) => {
                const remaining = r.totalFillableCount - r.filledFieldCount;
                return (
                  <Stack key={r.variantId} gap={2}>
                    <Group gap={6} wrap="nowrap">
                      <Text size="xs" style={{ flex: 1 }} truncate>
                        {r.outputFileName}
                      </Text>
                      <Badge size="xs" variant="light" color={remaining === 0 ? 'green' : 'blue'}>
                        {r.filledFieldCount}/{r.totalFillableCount}
                      </Badge>
                    </Group>
                    {remaining > 0 && (
                      <Group gap={4} pl={4}>
                        <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                          {remaining} field{remaining === 1 ? '' : 's'} still empty
                        </Text>
                        <Button
                          size="compact-xs"
                          variant="light"
                          onClick={() => openInFormFiller(r.outputFileId)}
                        >
                          Finish in Form Fill →
                        </Button>
                      </Group>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          </Stack>
        </div>
        <div className={styles.footer}>
          <Button fullWidth variant="subtle" onClick={handleReset}>
            Start Over
          </Button>
        </div>
      </div>
      </>
    );
  }

  // ── Analysis Review (main state) ──
  const roles = analysis.analysis?.crossFileRoles || [];
  // Pair mode is only meaningful when ≥2 roles each have the same multi-entity
  // count — otherwise zip and cartesian collapse to the same thing (or zip is
  // ill-defined). The planner is defensive (silently falls back to cartesian
  // when ineligible), so the UI just disables the toggle.
  const multiEntityCounts = roles
    .map((r) => (analysis.roleProfileMap[r.roleLabel] ?? []).length)
    .filter((n) => n > 1);
  const pairModeEligible =
    multiEntityCounts.length >= 2 &&
    multiEntityCounts.every((c) => c === multiEntityCounts[0]);
  const variantCount = batchFill.previewVariantCount(allFiles as any, pairMode);
  // True only when at least one role has at least one *resolvable* entity assigned
  // — distinct from "non-empty in the raw map" because stale IDs filter out.
  const hasResolvableAssignment = roles.some((r) =>
    (analysis.roleProfileMap[r.roleLabel] ?? []).some(
      (id) => !!knowledge.entityStore.getEntity(id),
    ),
  );

  return (
    <>{modal}
    <div className={styles.root}>
      <div className={styles.header}>
        <Group gap={8} mb="xs">
          <AutoAwesomeIcon sx={{ fontSize: 20 }} />
          <Text fw={600} size="sm">{t('aiFormFill.title', 'AI Form Fill')}</Text>
        </Group>
        <Group gap={6} mb="xs">
          <Select
            size="xs"
            data={knowledge.entityStore.selectData}
            value={knowledge.entityStore.defaultEntityId}
            onChange={(v) => v && knowledge.entityStore.setDefaultEntity(v)}
            searchable
            styles={{ input: { fontSize: '0.8125rem' } }}
            style={{ flex: 1 }}
          />
          <Button variant="subtle" size="compact-xs" onClick={() => setModalOpened(true)}>
            Manage
          </Button>
        </Group>
        <Text size="xs" c="dimmed" mb={4}>
          {roles.length} role{roles.length !== 1 ? 's' : ''} detected across {allFiles.length} file{allFiles.length !== 1 ? 's' : ''}
          {variantCount > 0 && ` · will produce ${variantCount} filled file${variantCount === 1 ? '' : 's'}`}
          {variantCount === 0 && hasResolvableAssignment &&
            ' · no fields covered by assigned roles — try assigning a different role'}
        </Text>
        {analysis.analysis?.message && (
          <Text size="xs" c="dimmed">{analysis.analysis.message}</Text>
        )}
        <Tooltip
          label={
            pairModeEligible
              ? 'Zip entities by index across roles instead of producing every combination.'
              : 'Available when ≥2 roles each have the same number of entities (>1).'
          }
          withArrow
          position="top"
        >
          <Group gap={6} mt="xs">
            <Switch
              size="xs"
              checked={pairMode && pairModeEligible}
              disabled={!pairModeEligible}
              onChange={(e) => setPairMode(e.currentTarget.checked)}
              label="Pair entities across roles"
              styles={{ label: { fontSize: '0.75rem' } }}
            />
          </Group>
        </Tooltip>
        <SegmentedControl
          size="xs"
          value={viewMode}
          onChange={setViewMode}
          data={[
            { label: 'By Role', value: 'roles' },
            { label: 'Original Order', value: 'original' },
          ]}
          fullWidth
          mt="xs"
        />
      </div>

      <div className={styles.content}>
        <Stack gap="sm">
          {batchFill.error && (
            <Alert
              icon={<WarningAmberIcon />}
              color="red"
              variant="light"
              withCloseButton
              onClose={batchFill.reset}
            >
              {batchFill.error}
            </Alert>
          )}
          {viewMode === 'roles' ? (
            roles.map((role) => (
              <RoleSection
                key={role.roleLabel}
                role={role}
                entitySelectData={knowledge.entityStore.selectData}
                selectedEntityIds={analysis.roleProfileMap[role.roleLabel] ?? []}
                onEntitiesChange={(ids) => analysis.setRoleProfiles(role.roleLabel, ids)}
                fieldsByFile={analysis.fieldsByFile}
                cleanedLabelsByFile={cleanedLabelsByFile}
                skippedFieldsByFile={skippedFieldsByFile}
                fileNames={fileNames}
                fileRoleOverrides={analysis.fileRoleOverrides}
                onFileOverride={(fileId, ids) =>
                  ids.length > 0
                    ? analysis.setFileRoleOverride(fileId, role.roleLabel, ids)
                    : analysis.clearFileRoleOverride(fileId, role.roleLabel)
                }
              />
            ))
          ) : (
            allFiles.map((file) => {
              if (!isStirlingFile(file)) return null;
              const fields = analysis.fieldsByFile[file.fileId] || [];
              const skipped = skippedFieldsByFile[file.fileId] || new Set();
              const labels = cleanedLabelsByFile[file.fileId] || [];
              const labelMap: Record<string, string> = {};
              for (const cl of labels) labelMap[cl.fieldName] = cl.label;

              return (
                <Stack key={file.fileId} gap={4}>
                  <Text size="xs" fw={600}>{file.name}</Text>
                  {fields
                    .filter((f) => !skipped.has(f.name) && !f.readOnly)
                    .map((f) => (
                      <Text key={f.name} size="xs" c="dimmed" pl="sm">
                        {labelMap[f.name] || f.label || f.name}
                      </Text>
                    ))}
                  <Divider />
                </Stack>
              );
            })
          )}
        </Stack>
      </div>

      <div className={styles.footer}>
        <Group gap="xs">
          <Button variant="subtle" size="xs" onClick={handleReset}>
            Start Over
          </Button>
          <Button
            size="xs"
            style={{ flex: 1 }}
            leftSection={<AutoAwesomeIcon sx={{ fontSize: 16 }} />}
            onClick={handleFill}
            disabled={variantCount === 0}
          >
            {variantCount > 1
              ? `Generate ${variantCount} Filled Files`
              : variantCount === 1
                ? 'Fill Form'
                : !hasResolvableAssignment
                  ? 'Assign an entity'
                  : 'Fill'}
          </Button>
        </Group>
      </div>
    </div>
    </>
  );
};

export default AiFormFill as ToolComponent;
