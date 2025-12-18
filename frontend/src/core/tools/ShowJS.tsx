import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import { useBaseTool } from '@app/hooks/tools/shared/useBaseTool';
import type { BaseToolProps, ToolComponent } from '@app/types/tool';
import { useShowJSParameters, defaultParameters } from '@app/hooks/tools/showJS/useShowJSParameters';
import { useShowJSOperation, type ShowJSOperationHook } from '@app/hooks/tools/showJS/useShowJSOperation';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useNavigationActions, useNavigationState } from '@app/contexts/NavigationContext';
import ShowJSView from '@app/components/tools/showJS/ShowJSView';
import { useFileSelection } from '@app/contexts/file/fileHooks';

const ShowJS = (props: BaseToolProps) => {
	const { t } = useTranslation();
	const { actions: navigationActions } = useNavigationActions();
	const navigationState = useNavigationState();

	const {
		registerCustomWorkbenchView,
		unregisterCustomWorkbenchView,
		setCustomWorkbenchViewData,
		clearCustomWorkbenchViewData,
	} = useToolWorkflow();

	const VIEW_ID = 'showJSView';
	const WORKBENCH_ID = 'custom:showJS' as const;
	const viewIcon = useMemo(() => <LocalIcon icon="code-rounded" width={20} height={20} />, []);

	const base = useBaseTool('showJS', useShowJSParameters, useShowJSOperation, props, { minFiles: 1 });
	const operation = base.operation as ShowJSOperationHook;
	const hasResults = Boolean(operation.scriptText);
	const { clearSelections } = useFileSelection();

	useEffect(() => {
		registerCustomWorkbenchView({
			id: VIEW_ID,
			workbenchId: WORKBENCH_ID,
			label: t('showJS.view.title', 'JavaScript'),
			icon: viewIcon,
			component: ({ data }) => <ShowJSView data={data} />,
		});

		return () => {
			clearCustomWorkbenchViewData(VIEW_ID);
			unregisterCustomWorkbenchView(VIEW_ID);
		};
	}, [clearCustomWorkbenchViewData, registerCustomWorkbenchView, t, unregisterCustomWorkbenchView, viewIcon]);

	const lastShownRef = useRef<number | null>(null);

	useEffect(() => {
		if (operation.scriptText) {
			setCustomWorkbenchViewData(VIEW_ID, {
				scriptText: operation.scriptText,
				downloadUrl: operation.downloadUrl,
				downloadFilename: operation.downloadFilename,
			});
			const marker = operation.scriptText.length;
			const isNew = lastShownRef.current == null || marker !== lastShownRef.current;
			if (isNew) {
				lastShownRef.current = marker;
				if (navigationState.selectedTool === 'showJS' && navigationState.workbench !== WORKBENCH_ID) {
					navigationActions.setWorkbench(WORKBENCH_ID);
				}
			}
		} else {
			clearCustomWorkbenchViewData(VIEW_ID);
			lastShownRef.current = null;
		}
	}, [
		clearCustomWorkbenchViewData,
		navigationActions,
		navigationState.selectedTool,
		navigationState.workbench,
		operation.scriptText,
		setCustomWorkbenchViewData,
	]);
	
	useEffect(() => {
		if ((base.selectedFiles?.length ?? 0) === 0) {
			try { base.operation.resetResults(); } catch { /* noop */ }
			try { clearCustomWorkbenchViewData(VIEW_ID); } catch { /* noop */ }
			if (navigationState.workbench === WORKBENCH_ID) {
				try { navigationActions.setWorkbench('fileEditor'); } catch { /* noop */ }
			}
			lastShownRef.current = null;
		}
	}, [
		base.selectedFiles?.length,
		base.operation,
		clearCustomWorkbenchViewData,
		navigationActions,
		navigationState.workbench,
	]);

	return createToolFlow({
		files: {
			selectedFiles: base.selectedFiles,
			isCollapsed: false,
		},
		steps: [],
		executeButton: {
			text: hasResults ? t('back', 'Back') : t('showJS.submit', 'Extract JavaScript'),
			loadingText: t('loading', 'Loading...'),
			onClick: hasResults
				? async () => {
						// Clear results and deselect files so user can pick another file
						try {
							await base.operation.resetResults();
						} catch { /* noop */ }
						try {
							clearSelections();
						} catch { /* noop */ }
						// Close the custom JS view and send user back to file manager to pick another file
						try {
							clearCustomWorkbenchViewData(VIEW_ID);
						} catch { /* noop */ }
						try {
							navigationActions.setWorkbench('fileEditor');
						} catch { /* noop */ }
				  }
				: base.handleExecute,
			disabled: hasResults
				? false
				: (
					!base.hasFiles ||
					(base.selectedFiles?.length ?? 0) !== 1 ||
					base.operation.isLoading ||
					base.endpointLoading ||
					base.endpointEnabled === false
				),
			isVisible: true,
		},
		review: {
			isVisible: hasResults,
			operation: base.operation,
			title: t('showJS.results', 'Result'),
			onUndo: undefined,
		},
	});
};

const ShowJSTool = ShowJS as ToolComponent;
ShowJSTool.tool = () => useShowJSOperation;
ShowJSTool.getDefaultParameters = () => ({ ...defaultParameters });

export default ShowJSTool;


