import { defineConfig, type OxlintGlobals } from "oxlint";

// Glob for all editor app source, and the two layers that need their own
// import scope. `no-restricted-imports` is repeated per scope on purpose:
// oxlint REPLACES (does not merge) a rule across matching overrides, so each
// scope must restate the full set of bans that apply to it.
const APP_SOURCE = "src/**/*.{js,mjs,jsx,ts,tsx}";
const DESKTOP_SOURCE = "src/editor/desktop/**/*.{js,mjs,jsx,ts,tsx}";
const CLOUD_SOURCE = "src/editor/cloud/**/*.{js,mjs,jsx,ts,tsx}";

// Shared import-ban building blocks -----------------------------------------

const aliasOverRelative = {
  regex: "^\\.",
  message:
    "Use a workspace alias (@editor/* for editor, @processor/* for portal) instead of relative imports.",
};
const aliasOverSrc = {
  regex: "^src/",
  message: "Use a workspace alias instead of absolute src/ imports.",
};
const noTauriOutsideDesktop = {
  regex: "^@tauri-apps/",
  message:
    "Tauri APIs are desktop-only. Review frontend/DeveloperGuide.md for structure advice.",
};
const cloudNoTauri = {
  regex: "^@tauri-apps/",
  message:
    "cloud/ must stay platform-portable. Tauri APIs are desktop-only — reach native features via an @editor/* seam (e.g. @editor/platform/openExternal).",
};
const cloudNoSupabase = {
  regex: "^@supabase/",
  message:
    "cloud/ must stay platform-portable. Reach Supabase via an @editor/* seam (e.g. @editor/auth/supabase, @editor/auth/session) provided per-platform in saas/ and desktop/.",
};

// Shared-DS Button/SegmentedControl/Chip family must come from @editor/ui, not
// Mantine. (The raw-<button> ban from the ESLint config used
// no-restricted-syntax, which oxlint does not implement, so it is dropped.)
const mantineDsPaths = [
  {
    name: "@mantine/core",
    importNames: [
      "Button",
      "ActionIcon",
      "UnstyledButton",
      "CloseButton",
      "FileButton",
    ],
    message:
      'Use the shared Button (@editor/ui/Button) instead of the Mantine button family. variant=primary|secondary|tertiary, accent=default|neutral|brand|ai|premium|danger|success|warning; an icon-only button is `<Button leftSection={…} aria-label="…" />`. If no variant fits, extend the shared Button rather than importing Mantine.',
  },
  {
    name: "@mantine/core",
    importNames: ["SegmentedControl"],
    message:
      "Use the shared SegmentedControl (@editor/ui/SegmentedControl) instead of Mantine's.",
  },
  {
    name: "@mantine/core",
    importNames: ["Chip", "Pill"],
    message:
      "Use the shared Chip (@editor/ui/Chip) instead of Mantine's Chip/Pill.",
  },
];

// Modern JS globals not yet in oxlint's builtin env.
const modernGlobals: OxlintGlobals = {
  AsyncDisposableStack: "readonly",
  DisposableStack: "readonly",
  SuppressedError: "readonly",
};

const nestedTernaryBacklog = [
  "src/editor/cloud/components/shared/config/configSections/Payg.tsx",
  "src/editor/cloud/components/shared/config/configSections/usageMeters.tsx",
  "src/editor/cloud/hooks/useFreeCreditsSummary.ts",
  "src/editor/cloud/hooks/useWallet.ts",
  "src/editor/core/components/StorageStatsCard.tsx",
  "src/editor/core/components/annotation/shared/PropertiesPopover.tsx",
  "src/editor/core/components/easterEgg/brickGame/brickGameEngine.ts",
  "src/editor/core/components/filesPage/DiskLinkBadge.tsx",
  "src/editor/core/components/filesPage/FileDetailsPanel.tsx",
  "src/editor/core/components/filesPage/FileGrid.tsx",
  "src/editor/core/components/filesPage/FolderListRow.tsx",
  "src/editor/core/components/filesPage/FolderOriginBadge.tsx",
  "src/editor/core/components/filesPage/FolderTreeSidebar.tsx",
  "src/editor/core/components/filesPage/MoveToFolderDialog.tsx",
  "src/editor/core/components/filesPage/NewFolderButton.tsx",
  "src/editor/core/components/filesPage/VersionHistoryModal.tsx",
  "src/editor/core/components/notifications/notificationActionSlots.ts",
  "src/editor/core/components/onboarding/OnboardingModalSlide.tsx",
  "src/editor/core/components/onboarding/OnboardingTour.tsx",
  "src/editor/core/components/pageTracks/PageTracks.tsx",
  "src/editor/core/components/pageTracks/TrackPageTile.tsx",
  "src/editor/core/components/pageTracks/TrackPageViewModal.tsx",
  "src/editor/core/components/shared/DropdownListWithFooter.tsx",
  "src/editor/core/components/shared/EditableSecretField.tsx",
  "src/editor/core/components/shared/EncryptedPdfUnlockModal.tsx",
  "src/editor/core/components/shared/FileSelectorPicker.tsx",
  "src/editor/core/components/shared/LanguageSelector.tsx",
  "src/editor/core/components/shared/PolicyBadges.tsx",
  "src/editor/core/components/shared/StepModalHeader.tsx",
  "src/editor/core/components/shared/Tooltip.tsx",
  "src/editor/core/components/shared/UpdateModal.test.tsx",
  "src/editor/core/components/shared/Wordmark.tsx",
  "src/editor/core/components/shared/WorkbenchBar.tsx",
  "src/editor/core/components/shared/config/LegacySubscriptionPlan.tsx",
  "src/editor/core/components/shared/config/configSections/Overview.tsx",
  "src/editor/core/components/shared/config/configSections/ProviderCard.tsx",
  "src/editor/core/components/shared/config/configSections/ThirdPartyLicensesSection.tsx",
  "src/editor/core/components/shared/ownership/OwnershipTransferActions.tsx",
  "src/editor/core/components/shared/ownership/OwnershipTransferModal.tsx",
  "src/editor/core/components/shared/signing/CreateSessionFlow.tsx",
  "src/editor/core/components/shared/signing/SigningDocumentPicker.tsx",
  "src/editor/core/components/shared/signing/SigningSessionsTable.tsx",
  "src/editor/core/components/shared/signing/SigningWorkspace.tsx",
  "src/editor/core/components/shared/workbenchBar/useSaveButton.ts",
  "src/editor/core/components/toast/ToastContext.tsx",
  "src/editor/core/components/tools/RightSidebar.tsx",
  "src/editor/core/components/tools/ToolPanel.tsx",
  "src/editor/core/components/tools/ToolPicker.tsx",
  "src/editor/core/components/tools/addAttachments/AttachmentManagerUI.tsx",
  "src/editor/core/components/tools/addAttachments/AttachmentRow.tsx",
  "src/editor/core/components/tools/addStamp/StampPositionFormattingSettings.tsx",
  "src/editor/core/components/tools/automate/AutomationImportModal.tsx",
  "src/editor/core/components/tools/automate/IconSelector.tsx",
  "src/editor/core/components/tools/certSign/modals/CertificateConfigModal.tsx",
  "src/editor/core/components/tools/certSign/panels/ParticipantListPanel.tsx",
  "src/editor/core/components/tools/certSign/panels/SessionActionsPanel.tsx",
  "src/editor/core/components/tools/certSign/panels/SignControlsPanel.tsx",
  "src/editor/core/components/tools/certSign/panels/SignRequestPanel.tsx",
  "src/editor/core/components/tools/compare/CompareDocumentPane.tsx",
  "src/editor/core/components/tools/compare/CompareWorkbenchView.tsx",
  "src/editor/core/components/tools/compare/hooks/useComparePanZoom.ts",
  "src/editor/core/components/tools/getPdfInfo/sections/ComplianceSection.tsx",
  "src/editor/core/components/tools/getPdfInfo/sections/SummarySection.tsx",
  "src/editor/core/components/tools/shared/FileStatusIndicator.tsx",
  "src/editor/core/components/tools/shared/OperationButton.tsx",
  "src/editor/core/components/tools/shared/createToolFlow.tsx",
  "src/editor/core/components/tools/sign/SignSettings.tsx",
  "src/editor/core/components/tools/toolPicker/ToolButton.tsx",
  "src/editor/core/components/tools/validateSignature/ValidateSignatureResults.tsx",
  "src/editor/core/components/viewer/AttachmentSidebar.tsx",
  "src/editor/core/components/viewer/EmbedPdfViewer.tsx",
  "src/editor/core/components/viewer/PdfProtectionStatus.tsx",
  "src/editor/core/components/viewer/PdfViewerToolbar.tsx",
  "src/editor/core/components/viewer/RulerMeasurementLayer.tsx",
  "src/editor/core/components/viewer/ScaleSettingsPanel.tsx",
  "src/editor/core/components/viewer/ThumbnailSidebar.tsx",
  "src/editor/core/components/viewer/nonpdf/TextViewer.tsx",
  "src/editor/core/contexts/AppConfigContext.tsx",
  "src/editor/core/contexts/FileContext.tsx",
  "src/editor/core/contexts/FilesModalContext.test.tsx",
  "src/editor/core/contexts/FilesModalContext.tsx",
  "src/editor/core/contexts/FolderContext.tsx",
  "src/editor/core/contexts/ViewerContext.tsx",
  "src/editor/core/hooks/signing/useSigningSessionController.test.tsx",
  "src/editor/core/hooks/tools/checkAccessibility/accessibilityReportPdf.ts",
  "src/editor/core/hooks/tools/compare/useCompareOperation.ts",
  "src/editor/core/hooks/tools/shared/useToolApiCalls.failures.test.ts",
  "src/editor/core/hooks/tools/shared/useToolApiCalls.ts",
  "src/editor/core/hooks/tools/shared/useToolOperation.ts",
  "src/editor/core/hooks/useFileManager.ts",
  "src/editor/core/hooks/useFormDetectionModelStatus.ts",
  "src/editor/core/hooks/useLibraryRefresh.ts",
  "src/editor/core/hooks/useNewFolderFlow.ts",
  "src/editor/core/i18n.ts",
  "src/editor/core/icons/IconRegistry.stories.tsx",
  "src/editor/core/pages/HomePage.tsx",
  "src/editor/core/pages/MobileScannerPage.tsx",
  "src/editor/core/pages/SettingsPage.tsx",
  "src/editor/core/services/failureReporting.ts",
  "src/editor/core/services/fileSyncService.ts",
  "src/editor/core/services/pdfAccessService.ts",
  "src/editor/core/services/pdfSessionUnlock.ts",
  "src/editor/core/services/pdfiumFontFallback.test.ts",
  "src/editor/core/tests/helpers/multipart-capture.ts",
  "src/editor/core/tests/stubbed/pdf-text-editor-fix-undo-ink.spec.ts",
  "src/editor/core/tests/stubbed/pdf-text-editor-known-issues.spec.ts",
  "src/editor/core/tests/stubbed/pdf-text-editor-vis-rotation.spec.ts",
  "src/editor/core/tools/ChangePermissions.tsx",
  "src/editor/core/tools/annotate/AnnotationPanel.tsx",
  "src/editor/core/tools/annotate/useAnnotationSelection.ts",
  "src/editor/core/tools/annotate/useAnnotationStyleState.ts",
  "src/editor/core/tools/formFill/FormFieldCreationOverlay.tsx",
  "src/editor/core/tools/formFill/FormFieldEditOverlay.tsx",
  "src/editor/core/tools/formFill/FormFieldOverlay.tsx",
  "src/editor/core/tools/formFill/FormFill.tsx",
  "src/editor/core/tools/formFill/FormFillContext.tsx",
  "src/editor/core/tools/formFill/formCoordinateUtils.ts",
  "src/editor/core/tools/pdfTextEditor/__tests__/materialiseTable.test.ts",
  "src/editor/core/tools/pdfTextEditor/__tests__/pdfFixtures.ts",
  "src/editor/core/tools/pdfTextEditor/__tests__/tagPageContent.test.ts",
  "src/editor/core/tools/pdfTextEditor/commands/AlignParagraphLinesCommand.ts",
  "src/editor/core/tools/pdfTextEditor/commands/EditTextCommand.ts",
  "src/editor/core/tools/pdfTextEditor/commands/MaterialiseTableCommand.ts",
  "src/editor/core/tools/pdfTextEditor/commands/MergeRunsCommand.ts",
  "src/editor/core/tools/pdfTextEditor/commands/SetTextOutlineCommand.ts",
  "src/editor/core/tools/pdfTextEditor/commands/partialEdit.ts",
  "src/editor/core/tools/pdfTextEditor/commands/scanTextEdit.ts",
  "src/editor/core/tools/pdfTextEditor/commands/tableHelpers.ts",
  "src/editor/core/tools/pdfTextEditor/components/AnnotationOutline.tsx",
  "src/editor/core/tools/pdfTextEditor/components/FindBar.tsx",
  "src/editor/core/tools/pdfTextEditor/components/ImageHandle.tsx",
  "src/editor/core/tools/pdfTextEditor/components/ShapeHandle.tsx",
  "src/editor/core/tools/pdfTextEditor/components/TableOverlay.tsx",
  "src/editor/core/tools/pdfTextEditor/components/TextRunOverlay.tsx",
  "src/editor/core/tools/pdfTextEditor/components/inspector/DocumentInspector.tsx",
  "src/editor/core/tools/pdfTextEditor/components/toolbar/FormatGroup.tsx",
  "src/editor/core/tools/pdfTextEditor/model/EditorDocument.ts",
  "src/editor/core/tools/pdfTextEditor/pdfdoc/bytes.ts",
  "src/editor/core/tools/pdfTextEditor/pdfdoc/passes/cutElements.ts",
  "src/editor/core/tools/pdfTextEditor/pdfdoc/passes/setDocumentLanguage.ts",
  "src/editor/core/tools/pdfTextEditor/pdfium/BackgroundSampler.ts",
  "src/editor/core/tools/pdfTextEditor/pdfium/ParagraphGrouper.ts",
  "src/editor/core/tools/pdfTextEditor/pdfium/PdfiumTextReader.ts",
  "src/editor/core/tools/pdfTextEditor/util/imagePixels.ts",
  "src/editor/core/ui/ActionIcon.tsx",
  "src/editor/core/ui/Button.tsx",
  "src/editor/core/ui/Chip.tsx",
  "src/editor/core/ui/DataTable.tsx",
  "src/editor/core/ui/Dropdown.tsx",
  "src/editor/core/ui/MetricCard.tsx",
  "src/editor/core/ui/ProgressBar.tsx",
  "src/editor/core/ui/Skeleton.tsx",
  "src/editor/core/ui/StepIndicator.tsx",
  "src/editor/core/utils/accessibilityAssessment.ts",
  "src/editor/core/utils/accessibilityPlainLanguage.ts",
  "src/editor/core/utils/accessibilityReportContent.ts",
  "src/editor/core/utils/bulkselection/selectionBuilders.ts",
  "src/editor/core/utils/documentDetection.ts",
  "src/editor/core/utils/pdfiumPageRender.ts",
  "src/editor/core/utils/perspectiveWarp.test.ts",
  "src/editor/desktop/components/AppProviders.tsx",
  "src/editor/desktop/components/ConnectionSettings.tsx",
  "src/editor/desktop/components/layout/TitleBarStrip.tsx",
  "src/editor/desktop/components/onboarding/classificationDemo/classificationDemoSweep.ts",
  "src/editor/desktop/components/shared/SelfHostedOfflineBanner.tsx",
  "src/editor/desktop/components/shared/config/configSections/DefaultAppSettings.tsx",
  "src/editor/desktop/components/shared/config/configSections/GeneralSection.tsx",
  "src/editor/desktop/hooks/useDesktopUpdatePopup.test.ts",
  "src/editor/desktop/hooks/useDesktopUpdatePopup.ts",
  "src/editor/desktop/services/connectionModeService.ts",
  "src/editor/desktop/services/processingFolderApi.ts",
  "src/editor/desktop/services/pruneMissingRecentFiles.test.ts",
  "src/editor/desktop/utils/automationExecutor.ts",
  "src/editor/proprietary/auth/spring/springAuthClient.ts",
  "src/editor/proprietary/components/AccountLinkNotice.tsx",
  "src/editor/proprietary/components/chat/ChatContext.tsx",
  "src/editor/proprietary/components/policies/EditorPipelinesPanel.tsx",
  "src/editor/proprietary/components/policies/FolderIngestionSettings.tsx",
  "src/editor/proprietary/components/policies/PolicyRecoveryGate.tsx",
  "src/editor/proprietary/components/policies/PolicySetupWizard.tsx",
  "src/editor/proprietary/components/policies/ProcessingFolderPicker.tsx",
  "src/editor/proprietary/components/policies/ProcessingFolderWizard.tsx",
  "src/editor/proprietary/components/policies/RoutingRules.tsx",
  "src/editor/proprietary/components/policies/SweepRunWall.tsx",
  "src/editor/proprietary/components/serverSetup/ServerSetupWizard.tsx",
  "src/editor/proprietary/components/settings/ConnectedInstanceRow.tsx",
  "src/editor/proprietary/components/shared/UpgradeBanner.tsx",
  "src/editor/proprietary/components/shared/config/configSections/AdminFormDetectionSection.tsx",
  "src/editor/proprietary/components/shared/config/configSections/AdminUsageSection.tsx",
  "src/editor/proprietary/components/shared/config/configSections/ai/AiConnectionCard.tsx",
  "src/editor/proprietary/components/shared/config/configSections/ai/AiDocumentsCard.tsx",
  "src/editor/proprietary/components/shared/config/configSections/ai/AiModelsCard.tsx",
  "src/editor/proprietary/components/shared/config/configSections/ai/AiStatusCard.tsx",
  "src/editor/proprietary/components/shared/config/configSections/audit/AuditFiltersForm.tsx",
  "src/editor/proprietary/components/shared/config/configSections/audit/AuditStatsCards.tsx",
  "src/editor/proprietary/components/shared/config/configSections/plan/PlanCard.tsx",
  "src/editor/proprietary/components/shared/config/configSections/server/AdminSystemSection.tsx",
  "src/editor/proprietary/components/shared/stripeCheckout/StripeCheckout.tsx",
  "src/editor/proprietary/components/shared/stripeCheckout/components/PriceDisplay.tsx",
  "src/editor/proprietary/components/shared/stripeCheckout/stages/SuccessStage.tsx",
  "src/editor/proprietary/contexts/CheckoutContext.tsx",
  "src/editor/proprietary/policies/codec.ts",
  "src/editor/proprietary/routes/ShareLinkPage.tsx",
  "src/editor/proprietary/services/creditPromptPipelines.test.ts",
  "src/editor/proprietary/services/heuristic/heuristicEngine.ts",
  "src/editor/proprietary/services/policyPipeline.ts",
  "src/editor/proprietary/utils/currencyDetection.ts",
  "src/editor/saas/components/runLocation/DesktopDownloadStep.tsx",
  "src/editor/saas/components/runLocation/SelfHostStep.tsx",
  "src/editor/saas/components/settings/ConnectedInstancesSection.tsx",
  "src/editor/saas/components/shared/config/configSections/ApiKeys.tsx",
  "src/editor/saas/components/tools/sign/SignSettings.tsx",
  "src/editor/saas/routes/AuthCallback.tsx",
  "src/editor/saas/routes/ConnectApproveView.tsx",
  "src/editor/saas/routes/ResetPassword.tsx",
  "src/processor/proprietary/api/processorFlow.ts",
  "src/processor/proprietary/components/DownloadEditorModal.tsx",
  "src/processor/proprietary/components/HomeGreeting.tsx",
  "src/processor/proprietary/components/ProcessorFlow.tsx",
  "src/processor/proprietary/components/account-link/AccountConnectionNotice.tsx",
  "src/processor/proprietary/components/account-link/AccountLinkPanel.tsx",
  "src/processor/proprietary/components/account-link/ConnectCallbackView.tsx",
  "src/processor/proprietary/components/account-link/connect/ConnectAskStep.tsx",
  "src/processor/proprietary/components/billing/BundleCheckoutModal.tsx",
  "src/processor/proprietary/components/billing/FreeTierPlanView.tsx",
  "src/processor/proprietary/components/billing/InvoicesSection.tsx",
  "src/processor/proprietary/components/billing/PaymentSection.tsx",
  "src/processor/proprietary/components/billing/PdfsProcessedCard.tsx",
  "src/processor/proprietary/components/billing/ServerLicenseSection.tsx",
  "src/processor/proprietary/components/billing/StripeCheckoutModal.tsx",
  "src/processor/proprietary/components/infrastructure/AuditTab.tsx",
  "src/processor/proprietary/components/infrastructure/EncryptionMigrationCard.tsx",
  "src/processor/proprietary/components/infrastructure/EncryptionPanel.tsx",
  "src/processor/proprietary/components/policies/PolicyExternalApiConfig.tsx",
  "src/processor/proprietary/components/policies/PolicySetupOutput.tsx",
  "src/processor/proprietary/components/policies/usePolicySetupIngestion.ts",
  "src/processor/proprietary/components/processor-flow/FlowPolicies.tsx",
  "src/processor/proprietary/components/procurement/DealPanels.tsx",
  "src/processor/proprietary/components/procurement/ProcurementExtras.tsx",
  "src/processor/proprietary/components/procurement/QuoteBuilder.tsx",
  "src/processor/proprietary/components/procurement/QuoteBuilderSteps.tsx",
  "src/processor/proprietary/components/procurement/SetupChecklist.tsx",
  "src/processor/proprietary/components/procurement/quotePricing.ts",
  "src/processor/proprietary/components/procurement/useProcurement.ts",
  "src/processor/proprietary/components/settings/PortalSettingsSectionHost.test.tsx",
  "src/processor/proprietary/components/sources/ConnectionForm.tsx",
  "src/processor/proprietary/components/sources/ConnectionModal.tsx",
  "src/processor/proprietary/components/sources/ConnectionTypePicker.tsx",
  "src/processor/proprietary/components/sources/SourceModal.tsx",
  "src/processor/proprietary/components/users/InviteMemberModal.tsx",
  "src/processor/proprietary/components/users/InviteTeammateFlow.tsx",
  "src/processor/proprietary/data/Endpoints.stories.tsx",
  "src/processor/proprietary/hooks/useBundleFlowState.ts",
  "src/processor/proprietary/hooks/useFreeCreditsSummary.ts",
  "src/processor/proprietary/mocks/documents.ts",
  "src/processor/proprietary/mocks/editorDeploy.ts",
  "src/processor/proprietary/mocks/handlers/procurementSaas.ts",
  "src/processor/proprietary/mocks/infrastructure.ts",
  "src/processor/proprietary/mocks/users.ts",
  "src/processor/proprietary/views/ConnectCallback.test.tsx",
  "src/processor/proprietary/views/Enterprise.tsx",
  "src/processor/proprietary/views/PipelineBuilder.tsx",
  "src/processor/proprietary/views/Usage.tsx",
  "src/processor/saas/auth/PortalAuthBoundary.tsx",
  "vite.config.ts",
];

export default defineConfig({
  plugins: ["typescript", "import", "react"],
  options: {
    typeAware: true,
  },
  categories: {
    correctness: "off",
  },
  env: {
    builtin: true,
  },
  ignorePatterns: [
    "dist",
    "dist-portal",
    "node_modules",
    "playwright-report",
    "storybook-static",
    "test-results",
    "dist",
    "public",
    "src-tauri",
    "playwright-report",
    "test-results",
  ],
  rules: {
    "constructor-super": "error",
    "for-direction": "error",
    "getter-return": "error",
    "no-async-promise-executor": "error",
    "no-case-declarations": "error",
    "no-class-assign": "error",
    "no-compare-neg-zero": "error",
    "no-cond-assign": "error",
    "no-const-assign": "error",
    "no-constant-binary-expression": "error",
    "no-constant-condition": "error",
    "no-control-regex": "error",
    "no-debugger": "error",
    "no-delete-var": "error",
    "no-dupe-class-members": "error",
    "no-dupe-else-if": "error",
    "no-dupe-keys": "error",
    "no-duplicate-case": "error",
    "no-empty": "error",
    "no-empty-character-class": "error",
    "no-empty-pattern": "error",
    "no-empty-static-block": "error",
    "no-ex-assign": "error",
    "no-extra-boolean-cast": "error",
    "no-fallthrough": "error",
    "no-func-assign": "error",
    "no-global-assign": "error",
    "no-import-assign": "error",
    "no-invalid-regexp": "error",
    "no-irregular-whitespace": "error",
    "no-loss-of-precision": "error",
    "no-misleading-character-class": "error",
    "no-new-native-nonconstructor": "error",
    "no-nonoctal-decimal-escape": "error",
    "no-obj-calls": "error",
    "no-prototype-builtins": "error",
    "no-redeclare": "error",
    "no-regex-spaces": "error",
    "no-self-assign": "error",
    "no-setter-return": "error",
    "no-shadow-restricted-names": "error",
    "no-sparse-arrays": "error",
    "no-this-before-super": "error",
    "no-unassigned-vars": "error",
    "no-unexpected-multiline": "error",
    "no-unreachable": "error",
    "no-unsafe-finally": "error",
    "no-unsafe-negation": "error",
    "no-unsafe-optional-chaining": "error",
    "no-unused-labels": "error",
    "no-unused-private-class-members": "error",
    "no-unused-vars": [
      "error",
      {
        args: "all",
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    "no-useless-backreference": "error",
    "no-useless-catch": "error",
    "no-useless-escape": "error",
    "no-with": "error",
    "preserve-caught-error": "error",
    "require-yield": "error",
    "use-isnan": "error",
    "valid-typeof": "error",
    "no-array-constructor": "error",
    "no-unused-expressions": "error",
    "no-nested-ternary": "error",
    "no-restricted-imports": [
      "error",
      {
        patterns: [aliasOverRelative, aliasOverSrc],
      },
    ],
    "typescript/ban-ts-comment": "error",
    "typescript/no-duplicate-enum-values": "error",
    "typescript/no-empty-object-type": [
      "error",
      {
        allowInterfaces: "with-single-extends",
      },
    ],
    "typescript/no-explicit-any": "error",
    "typescript/no-extra-non-null-assertion": "error",
    "typescript/no-misused-new": "error",
    "typescript/no-namespace": "error",
    "typescript/no-non-null-asserted-optional-chain": "error",
    "typescript/no-require-imports": "error",
    "typescript/no-this-alias": "error",
    "typescript/no-unnecessary-type-assertion": "error",
    "typescript/no-unnecessary-type-constraint": "error",
    "typescript/no-unsafe-declaration-merging": "error",
    "typescript/no-unsafe-function-type": "error",
    "typescript/no-wrapper-object-types": "error",
    "typescript/prefer-as-const": "error",
    "typescript/prefer-namespace-keyword": "error",
    "typescript/triple-slash-reference": "error",
    "react/jsx-max-depth": ["error", { max: 8 }],
  },
  overrides: [
    {
      // TS files: core JS rules superseded by the TypeScript compiler are turned
      // off, and the TS-appropriate replacements are enabled. Mirrors
      // typescript-eslint's recommended flat config.
      files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
      rules: {
        "constructor-super": "off",
        "getter-return": "off",
        "no-class-assign": "off",
        "no-const-assign": "off",
        "no-dupe-class-members": "off",
        "no-dupe-keys": "off",
        "no-func-assign": "off",
        "no-import-assign": "off",
        "no-new-native-nonconstructor": "off",
        "no-obj-calls": "off",
        "no-redeclare": "off",
        "no-setter-return": "off",
        "no-this-before-super": "off",
        "no-unreachable": "off",
        "no-unsafe-negation": "off",
        "no-var": "error",
        "no-with": "off",
        "prefer-const": "error",
        "prefer-rest-params": "error",
        "prefer-spread": "error",
      },
    },
    {
      // Browser globals for all editor app source.
      files: [APP_SOURCE],
      env: {
        browser: true,
      },
      globals: modernGlobals,
    },
    {
      // Node globals for build scripts, config files, and Storybook config.
      files: [
        "scripts/**/*.{js,ts,mjs,mts}",
        "*.config.{js,ts,mjs}",
        ".storybook/*.{js,ts,mjs,mts,tsx}",
      ],
      globals: modernGlobals,
      env: {
        node: true,
      },
    },
    {
      // Editor app source (excluding desktop): ban relative/src imports, ban
      // Tauri (desktop-only), and the shared-DS Mantine import ban.
      files: [APP_SOURCE],
      excludeFiles: [DESKTOP_SOURCE],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [aliasOverRelative, aliasOverSrc, noTauriOutsideDesktop],
            paths: mantineDsPaths,
          },
        ],
      },
    },
    {
      // Desktop source: same DS import ban, but Tauri is allowed here (this is
      // the only layer that may reach @tauri-apps/* directly).
      files: [DESKTOP_SOURCE],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [aliasOverRelative, aliasOverSrc],
            paths: mantineDsPaths,
          },
        ],
      },
    },
    {
      // The cloud/ layer is the SHARED hosted/SaaS experience consumed by BOTH
      // the saas and desktop leaves, so it must stay platform-portable: no
      // Supabase or Tauri directly, and no raw fetch/localStorage/sessionStorage
      // - those arrive via @editor/* seams that each leaf provides for its own
      // platform. window.location and import.meta.env are banned below via the
      // no-restricted-properties.
      files: [CLOUD_SOURCE],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              aliasOverRelative,
              aliasOverSrc,
              cloudNoTauri,
              cloudNoSupabase,
            ],
            paths: mantineDsPaths,
          },
        ],
        "no-restricted-globals": [
          "error",
          {
            name: "fetch",
            message:
              "cloud/ must not call raw fetch — use @editor/services/apiClient so each platform supplies its own transport.",
          },
          {
            name: "localStorage",
            message:
              "cloud/ must not touch localStorage — use an @editor/* storage seam so desktop/web can differ.",
          },
          {
            name: "sessionStorage",
            message:
              "cloud/ must not touch sessionStorage — use an @editor/* storage seam so desktop/web can differ.",
          },
        ],
        "no-restricted-properties": [
          "error",
          {
            object: "window",
            property: "location",
            message:
              "cloud/ must not touch window.location - use an @editor/* seam (e.g. @editor/platform/openExternal) so desktop/web can differ.",
          },
          {
            // Property-only: import.meta.env's object is a MetaProperty, which
            // no-restricted-properties can't target, so this bans every `.env`
            // read in cloud/ - which matches the intent (config comes via seams,
            // never env). cloud/ has no other `.env` access today.
            property: "env",
            message:
              "cloud/ must not read import.meta.env - config comes from @editor/constants/app / @editor/platform seams, not env.",
          },
        ],
      },
    },
    {
      // Exempt from the shared-DS Mantine import ban (these layers may use
      // Mantine directly): the shared DS itself wraps Mantine and stories/tests
      // demo it. Module-path bans still apply.
      // The three named files are ARIA tablist/segmented controls that the
      // ESLint config exempted from the (now-dropped) raw-<button> and Mantine
      // rules. Comes after the scoped bans above so it wins for these files;
      // desktop/cloud keep theirs.
      files: [
        "src/editor/core/ui/**/*.{js,mjs,jsx,ts,tsx}",
        "**/*.stories.{js,mjs,jsx,ts,tsx}",
        "**/*.test.{js,mjs,jsx,ts,tsx}",
        "src/editor/core/components/shared/FileSelectorPicker.tsx",
        "src/editor/core/components/filesPage/FileManagerView.tsx",
        "src/editor/core/pages/HomePage.tsx",
      ],
      excludeFiles: [DESKTOP_SOURCE, CLOUD_SOURCE],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [aliasOverRelative, aliasOverSrc, noTauriOutsideDesktop],
          },
        ],
      },
    },
    {
      // Desktop test/story files: like every other *.test/*.stories file they
      // are exempt from the shared-DS Mantine import ban; being desktop they also
      // keep the Tauri allowance.
      files: [
        "src/editor/desktop/**/*.test.{js,mjs,jsx,ts,tsx}",
        "src/editor/desktop/**/*.stories.{js,mjs,jsx,ts,tsx}",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [aliasOverRelative, aliasOverSrc],
          },
        ],
      },
    },
    {
      // A provider stack nests one context per level in dependency order, so its
      // depth counts providers rather than measuring how hard the tree is to read.
      files: [
        "src/editor/core/components/AppProviders.tsx",
        "src/processor/proprietary/PortalProviders.tsx",
        ".storybook/preview.tsx",
      ],
      rules: {
        "react/jsx-max-depth": "off",
      },
    },
    {
      // Circular-import detection across the editor app source (the import
      // plugin resolves @editor/* and the other tsconfig path aliases). Replaces
      // the previous dpdm pass.
      files: ["src/**/*.{ts,tsx}"],
      rules: {
        "import/no-cycle": "error",
      },
    },
    {
      files: nestedTernaryBacklog,
      rules: {
        "no-nested-ternary": "off",
      },
    },
  ],
});
