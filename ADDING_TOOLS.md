# Adding New React Tools to Stirling PDF

This guide covers how to add new PDF tools to the React frontend, either by migrating existing Thymeleaf templates or creating entirely new tools.

## Overview

When adding tools, follow this systematic approach using the established patterns and architecture.

## 1. Create Tool Structure

Create these files in the correct directories:
```
frontend/src/hooks/tools/[toolName]/
  ├── use[ToolName]Parameters.ts     # Parameter definitions and validation
  └── use[ToolName]Operation.ts      # Tool operation logic using useToolOperation

frontend/src/components/tools/[toolName]/
  └── [ToolName]Settings.tsx         # Settings UI component (if needed)

frontend/src/tools/
  └── [ToolName].tsx                 # Main tool component
```

## 2. Implementation Pattern

Use `useBaseTool` for simplified hook management. This is the recommended approach for all new tools:

**Parameters Hook** (`use[ToolName]Parameters.ts`):
```typescript
import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface [ToolName]Parameters extends BaseParameters {
  // Define your tool-specific parameters here
  someOption: boolean;
}

export const defaultParameters: [ToolName]Parameters = {
  someOption: false,
};

export const use[ToolName]Parameters = (): BaseParametersHook<[ToolName]Parameters> => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'your-endpoint-name',
    validateFn: (params) => true, // Add validation logic
  });
};
```

**Operation Hook** (`use[ToolName]Operation.ts`):
```typescript
import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';

export const build[ToolName]FormData = (parameters: [ToolName]Parameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  // Add parameters to formData
  return formData;
};

export const [toolName]OperationConfig = {
  toolType: ToolType.singleFile, // or ToolType.multiFile (buildFormData's file parameter will need to be updated)
  buildFormData: build[ToolName]FormData,
  operationType: '[toolName]',
  endpoint: '/api/v1/category/endpoint-name',
  filePrefix: 'processed_', // Will be overridden with translation
  defaultParameters,
} as const;

export const use[ToolName]Operation = () => {
  const { t } = useTranslation();
  return useToolOperation({
    ...[toolName]OperationConfig,
    filePrefix: t('[toolName].filenamePrefix', 'processed') + '_',
    getErrorMessage: createStandardErrorHandler(t('[toolName].error.failed', 'Operation failed'))
  });
};
```

**Main Component** (`[ToolName].tsx`):
```typescript
import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { use[ToolName]Parameters } from "../hooks/tools/[toolName]/use[ToolName]Parameters";
import { use[ToolName]Operation } from "../hooks/tools/[toolName]/use[ToolName]Operation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";

const [ToolName] = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const base = useBaseTool('[toolName]', use[ToolName]Parameters, use[ToolName]Operation, props);

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
      placeholder: t("[toolName].files.placeholder", "Select files to get started"),
    },
    steps: [
      // Add settings steps if needed
    ],
    executeButton: {
      text: t("[toolName].submit", "Process"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("[toolName].results.title", "Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

[ToolName].tool = () => use[ToolName]Operation;
export default [ToolName] as ToolComponent;
```

**Note**: Some existing tools (like AddPassword, Compress) use a legacy pattern with manual hook management. **Always use the Modern Pattern above for new tools** - it's cleaner, more maintainable, and includes automation support.

## 3. Register Tool in System
Update these files to register your new tool:

**Tool Registry** (`frontend/src/data/useTranslatedToolRegistry.tsx`):
1. Add imports at the top:
```typescript
import [ToolName] from "../tools/[ToolName]";
import { [toolName]OperationConfig } from "../hooks/tools/[toolName]/use[ToolName]Operation";
import [ToolName]Settings from "../components/tools/[toolName]/[ToolName]Settings";
```

2. Add tool entry in the `allTools` object:
```typescript
[toolName]: {
  icon: <LocalIcon icon="your-icon-name" width="1.5rem" height="1.5rem" />,
  name: t("home.[toolName].title", "Tool Name"),
  component: [ToolName],
  description: t("home.[toolName].desc", "Tool description"),
  categoryId: ToolCategoryId.STANDARD_TOOLS, // or appropriate category
  subcategoryId: SubcategoryId.APPROPRIATE_SUBCATEGORY,
  maxFiles: -1, // or specific number
  endpoints: ["endpoint-name"],
  operationConfig: [toolName]OperationConfig,
  settingsComponent: [ToolName]Settings, // if settings exist
},
```

## 4. Add Tooltips (Optional but Recommended)
Create user-friendly tooltips to help non-technical users understand your tool. **Use simple, clear language - avoid technical jargon:**

**Tooltip Hook** (`frontend/src/components/tooltips/use[ToolName]Tips.ts`):
```typescript
import { useTranslation } from 'react-i18next';
import { TooltipContent } from '../../types/tips';

export const use[ToolName]Tips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("[toolName].tooltip.header.title", "Tool Overview")
    },
    tips: [
      {
        title: t("[toolName].tooltip.description.title", "What does this tool do?"),
        description: t("[toolName].tooltip.description.text", "Simple explanation in everyday language that non-technical users can understand."),
        bullets: [
          t("[toolName].tooltip.description.bullet1", "Easy-to-understand benefit 1"),
          t("[toolName].tooltip.description.bullet2", "Easy-to-understand benefit 2")
        ]
      }
      // Add more tip sections as needed
    ]
  };
};
```

**Add tooltip to your main component:**
```typescript
import { use[ToolName]Tips } from "../components/tooltips/use[ToolName]Tips";

const [ToolName] = (props: BaseToolProps) => {
  const tips = use[ToolName]Tips();
  
  // In your steps array:
  steps: [
    {
      title: t("[toolName].steps.settings", "Settings"),
      tooltip: tips, // Add this line
      content: <[ToolName]Settings ... />
    }
  ]
```

## 5. Add Translations
Update translation files. **Important: Only update `en-GB` files** - other languages are handled separately.

**File to update:** `frontend/public/locales/en-GB/translation.toml`

**Required Translation Keys**:
```toml
{
  "home": {
    "[toolName]": {
      "title": "Tool Name",
      "desc": "Tool description"
    }
  },
  "[toolName]": {
    "title": "Tool Name",
    "submit": "Process",
    "filenamePrefix": "processed",
    "files": {
      "placeholder": "Select files to get started"
    },
    "steps": {
      "settings": "Settings"
    },
    "options": {
      "title": "Tool Options",
      "someOption": "Option Label",
      "someOption.desc": "Option description",
      "note": "General information about the tool."
    },
    "results": {
      "title": "Results"
    },
    "error": {
      "failed": "Operation failed"
    },
    "tooltip": {
      "header": {
        "title": "Tool Overview"
      },
      "description": {
        "title": "What does this tool do?",
        "text": "Simple explanation in everyday language",
        "bullet1": "Easy-to-understand benefit 1",
        "bullet2": "Easy-to-understand benefit 2"
      }
    }
  }
}
```

**Translation Notes:**
- **Only update `en-GB/translation.toml`** - other locale files are managed separately
- Use descriptive keys that match your component's `t()` calls
- Include tooltip translations if you created tooltip hooks
- Add `options.*` keys if your tool has settings with descriptions

**Tooltip Writing Guidelines:**
- **Use simple, everyday language** - avoid technical terms like "converts interactive elements" 
- **Focus on benefits** - explain what the user gains, not how it works internally
- **Use concrete examples** - "text boxes become regular text" vs "form fields are flattened"
- **Answer user questions** - "What does this do?", "When should I use this?", "What's this option for?"
- **Keep descriptions concise** - 1-2 sentences maximum per section
- **Use bullet points** for multiple benefits or features

## 6. Migration from Thymeleaf
When migrating existing Thymeleaf templates:

1. **Identify Form Parameters**: Look at the original `<form>` inputs to determine parameter structure
2. **Extract Translation Keys**: Find `#{key.name}` references and add them to JSON translations (For many tools these translations will already exist but some parts will be missing)
3. **Map API Endpoint**: Note the `th:action` URL for the operation hook
4. **Preserve Functionality**: Ensure all original form behaviour is replicated which is applicable to V2 react UI

## 7. Testing Your Tool
- Verify tool appears in UI with correct icon and description
- Test with various file sizes and types
- Confirm translations work
- Check error handling
- Test undo functionality
- Verify results display correctly

## Tool Development Patterns

### Three Tool Patterns:

**Pattern 1: Single-File Tools** (Individual processing)
- Backend processes one file per API call
- Set `multiFileEndpoint: false`
- Examples: Compress, Rotate

**Pattern 2: Multi-File Tools** (Batch processing)
- Backend accepts `MultipartFile[]` arrays in single API call
- Set `multiFileEndpoint: true`
- Examples: Split, Merge, Overlay

**Pattern 3: Complex Tools** (Custom processing)
- Tools with complex routing logic or non-standard processing
- Provide `customProcessor` for full control
- Examples: Convert, OCR
