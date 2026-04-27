/**
 * AI Form Fill tool — analyses forms (role detection, label cleanup),
 * then fills using profiles. Supports multi-file bulk operations.
 */
import { useMemo, useCallback, useState } from 'react';
import {
  Stack,
  Text,
  Button,
  Progress,
  Loader,
  Alert,
  Badge,
  Divider,
  Group,
  Select,
  SegmentedControl,
  Checkbox,
} from '@mantine/core';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useTranslation } from 'react-i18next';
import { useFileState } from '@app/contexts/FileContext';
import { isStirlingFile } from '@app/types/fileContext';
import type { BaseToolProps, ToolComponent } from '@app/types/tool';
import { useKnowledgeStore } from './useKnowledgeStore';
import { useFormAnalysis } from './useFormAnalysis';
import { useBatchFormFillFlow } from './useBatchFormFillFlow';
import { ProfileManagementModal } from './ProfileManagementModal';
import { RoleSection } from './RoleSection';
import { FillPreview } from './FillPreview';
import { usePassiveLearning } from './usePassiveLearning';
import { checkCrossFormConsistency } from './workflowTemplates';
import type { CleanedLabel } from './types';
import styles from './AiFormFill.module.css';

const AiFormFill = (_props: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectors, state: fileState } = useFileState();
  const knowledge = useKnowledgeStore();
  const analysis = useFormAnalysis(knowledge);
  const batchFill = useBatchFormFillFlow(analysis, knowledge);
  const passiveLearning = usePassiveLearning();
  const [modalOpened, setModalOpened] = useState(false);
  const [viewMode, setViewMode] = useState<string>('roles');

  const allFiles = useMemo(() => {
    const files = selectors.getFiles();
    return files.filter((f) => isStirlingFile(f));
  }, [selectors, fileState.files.ids]);

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
      batchFill.fillAllFiles(allFiles as any);
    }
  }, [allFiles, batchFill.fillAllFiles]);

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
            <Text size="sm" c="dimmed">
              {allFiles.length > 0
                ? `${allFiles.length} file${allFiles.length > 1 ? 's' : ''} loaded. Analyse to detect form roles and fields.`
                : t('aiFormFill.noFile', 'Open PDF forms to get started.')}
            </Text>
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
    return (
      <>{modal}
      <div className={styles.root}>
        <div className={styles.content} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text size="sm" c="dimmed">
              {batchFill.phase === 'filling' ? 'AI is filling your forms...' : 'Applying fills...'}
            </Text>
          </Stack>
        </div>
      </div>
      </>
    );
  }

  // ── Fill Preview ──
  if (batchFill.phase === 'preview') {
    return (
      <>{modal}
      <div className={styles.root}>
        <div className={styles.header}>
          <Group gap={8} mb="xs">
            <AutoAwesomeIcon sx={{ fontSize: 20 }} />
            <Text fw={600} size="sm">Review Fills</Text>
          </Group>
          <Text size="xs" c="dimmed">
            Review proposed values before applying. Uncheck fields to skip, click values to edit.
          </Text>
        </div>
        <div className={styles.content}>
          <FillPreview
            fields={batchFill.previewFields}
            fileNames={fileNames}
            onToggle={batchFill.togglePreviewField}
            onEdit={batchFill.editPreviewField}
          />
        </div>
        <div className={styles.footer}>
          <Group gap="xs">
            <Button variant="subtle" size="xs" onClick={handleReset}>
              Cancel
            </Button>
            <Button
              size="xs"
              style={{ flex: 1 }}
              onClick={() => batchFill.applyPreview(allFiles as any)}
              disabled={!batchFill.previewFields.some((f) => f.accepted)}
            >
              Apply {batchFill.previewFields.filter((f) => f.accepted).length} Fields
            </Button>
          </Group>
        </div>
      </div>
      </>
    );
  }

  // ── Fill Complete ──
  if (batchFill.phase === 'done') {
    const totalFilled = batchFill.results.reduce((sum, r) => sum + r.filledFields.length, 0);

    // Consistency check
    const consistencyIssues = checkCrossFormConsistency(
      batchFill.results.map((r) => ({
        fileId: r.fileId,
        fileName: fileNames[r.fileId] || r.fileId,
        filledFields: r.filledFields,
      }))
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
              Filled {totalFilled} fields across {batchFill.results.length} files.
            </Text>
            {batchFill.message && <Text size="xs" c="dimmed">{batchFill.message}</Text>}
            {batchFill.error && (
              <Alert icon={<WarningAmberIcon />} color="red" variant="light">{batchFill.error}</Alert>
            )}

            {/* Consistency warnings */}
            {consistencyIssues.length > 0 && (
              <>
                <Divider />
                <Text size="xs" fw={600} c="orange">
                  Consistency Issues ({consistencyIssues.length})
                </Text>
                {consistencyIssues.map((issue, i) => (
                  <Alert key={i} color="yellow" variant="light" p="xs">
                    <Text size="xs">
                      Field "{issue.fieldLabel}" has different values across files:
                      {issue.values.map((v, j) => (
                        <Text key={j} size="xs" c="dimmed" component="span"> {v.fileName}: "{v.value}"</Text>
                      ))}
                    </Text>
                  </Alert>
                ))}
              </>
            )}

            {/* Passive learning — detect manual edits */}
            <Divider />
            <Button
              size="xs"
              variant="light"
              onClick={() => passiveLearning.detectChanges(batchFill.previewFields, knowledge.entityStore)}
            >
              Check for Manual Edits to Learn
            </Button>
            {passiveLearning.hasChanges && (
              <Stack gap={4}>
                <Text size="xs" fw={600}>
                  Detected {passiveLearning.learnedFields.length} manual changes:
                </Text>
                {passiveLearning.learnedFields.map((field, i) => (
                  <Group key={i} gap={6} wrap="nowrap">
                    <Checkbox
                      size="xs"
                      checked={field.accepted}
                      onChange={() => passiveLearning.toggleField(i)}
                    />
                    <Text size="xs" style={{ flex: 1 }}>
                      {field.fieldName}: "{field.newValue}"
                    </Text>
                    <Badge size="xs" variant="light">
                      → {field.suggestedEntityName || 'Unknown'}
                    </Badge>
                  </Group>
                ))}
                <Button
                  size="xs"
                  variant="light"
                  color="green"
                  onClick={() => passiveLearning.commitLearned(knowledge.entityStore)}
                  disabled={!passiveLearning.learnedFields.some((f) => f.accepted)}
                >
                  Save {passiveLearning.learnedFields.filter((f) => f.accepted).length} to Entities
                </Button>
              </Stack>
            )}
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
  const hasUnassignedRoles = roles.some((r) => !analysis.roleProfileMap[r.roleLabel]);

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
        </Text>
        {analysis.analysis?.message && (
          <Text size="xs" c="dimmed">{analysis.analysis.message}</Text>
        )}
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
            // Role-grouped view
            roles.map((role) => (
              <RoleSection
                key={role.roleLabel}
                role={role}
                entitySelectData={knowledge.entityStore.selectData}
                selectedEntityId={analysis.roleProfileMap[role.roleLabel]}
                onEntityChange={(id) => analysis.setRoleProfile(role.roleLabel, id)}
                fieldsByFile={analysis.fieldsByFile}
                cleanedLabelsByFile={cleanedLabelsByFile}
                skippedFieldsByFile={skippedFieldsByFile}
                fileNames={fileNames}
                fileRoleOverrides={analysis.fileRoleOverrides}
                onFileOverride={(fileId, entityId) =>
                  entityId
                    ? analysis.setFileRoleOverride(fileId, role.roleLabel, entityId)
                    : analysis.clearFileRoleOverride(fileId, role.roleLabel)
                }
              />
            ))
          ) : (
            // Original order — flat field list per file
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
            disabled={hasUnassignedRoles}
          >
            Fill {allFiles.length > 1 ? `${allFiles.length} Forms` : 'Form'}
          </Button>
        </Group>
      </div>
    </div>
    </>
  );
};

export default AiFormFill as ToolComponent;
