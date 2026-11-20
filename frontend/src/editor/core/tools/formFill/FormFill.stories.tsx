import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  appConfig,
  endpointUnavailable,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  choose,
  dragOnPage,
  openTooltip,
  type PlayContext,
  STAGE_TIMEOUT,
  waitForPanelText,
  waitForToolPanel,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import type {
  FormField,
  WidgetCoordinates,
} from "@editor/tools/formFill/types";

const meta = {
  title: "Tools/Form Editor/Panel",
  ...toolPanelMeta("formFill"),
};
export default meta;

type Story = StoryObj<typeof meta>;
type Play = NonNullable<Story["play"]>;

function inMode(mode: string): Play {
  return async (context) => {
    await choose(context, mode);
  };
}

export const Panel: Story = {};

export const SignedPdfLocked: Story = {
  args: { files: ["signed-sample.pdf"] },
  parameters: toolPanelServer(appConfig({ blockSignedPdfEdits: true })),
};

export const CreateMode: Story = {
  play: inMode("Create"),
};

export const CreateModeDrawing: Story = {
  play: async (context) => {
    await inMode("Create")(context);
    const panel = within(await waitForToolPanel(context));
    await userEvent.click(panel.getByRole("button", { name: "Text" }));
    await expect(
      await panel.findByText(
        "Draw a Text field on the page. Press Esc to stop.",
      ),
    ).toBeVisible();
  },
};

export const ModifyMode: Story = {
  play: inMode("Modify"),
};

async function waitUntilAutoDetectUnavailable(context: PlayContext) {
  const panel = within(await waitForToolPanel(context));
  await waitFor(
    () =>
      expect(
        panel.getByRole("button", { name: "Auto-detect fields" }),
      ).toBeDisabled(),
    STAGE_TIMEOUT,
  );
}

export const AutoDetectUnavailable: Story = {
  parameters: toolPanelServer(...endpointUnavailable("form-detection")),
  play: waitUntilAutoDetectUnavailable,
};

export const AutoDetectUnavailableTooltip: Story = {
  parameters: AutoDetectUnavailable.parameters,
  play: openTooltip(
    { info: "Auto-detect fields" },
    { after: waitUntilAutoDetectUnavailable },
  ),
};

function widget(
  pageIndex: number,
  x: number,
  y: number,
  width: number,
  height: number,
  extra?: Partial<WidgetCoordinates>,
): WidgetCoordinates {
  return { pageIndex, x, y, width, height, cropBoxHeight: 792, ...extra };
}

function field(
  name: string,
  label: string,
  type: FormField["type"],
  widgets: WidgetCoordinates[],
  extra?: Partial<FormField>,
): FormField {
  return {
    name,
    label,
    type,
    value: "",
    options: null,
    displayOptions: null,
    required: false,
    readOnly: false,
    multiSelect: false,
    multiline: false,
    tooltip: null,
    widgets,
    ...extra,
  };
}

const FORM_FIELDS: FormField[] = [
  field("fullName", "Full name", "text", [widget(0, 72, 120, 220, 22)], {
    required: true,
    tooltip: "As it appears on your passport",
  }),
  field("email", "Email", "text", [widget(0, 72, 170, 220, 22)], {
    required: true,
  }),
  field("subscribe", "Send me updates", "checkbox", [
    widget(0, 72, 220, 14, 14, { exportValue: "Yes" }),
  ]),
  field("country", "Country", "combobox", [widget(0, 72, 260, 160, 22)], {
    options: ["United Kingdom", "Ireland", "United States"],
  }),
  field("interests", "Interests", "listbox", [widget(1, 72, 100, 160, 60)], {
    options: ["Design", "Engineering", "Sales"],
    multiSelect: true,
  }),
  field(
    "contactMethod",
    "Contact method",
    "radio",
    [
      widget(1, 72, 190, 14, 14, { exportValue: "email" }),
      widget(1, 72, 210, 14, 14, { exportValue: "phone" }),
    ],
    { options: ["email", "phone"] },
  ),
  field("submit", "Submit", "button", [widget(1, 72, 260, 100, 26)], {
    buttonLabel: "Submit",
    buttonActionSpec: "uri:https://example.com/submit",
  }),
  field("applicantSignature", "Signature", "signature", [
    widget(1, 72, 320, 200, 50),
  ]),
];

const withFormFields = {
  args: {
    files: ["form-fields-sample.pdf"],
    showWorkbench: true,
    workbench: "viewer",
  },
  parameters: toolPanelServer(
    http.post("*/api/v1/form/fields-with-coordinates", () =>
      HttpResponse.json(FORM_FIELDS),
    ),
  ),
} as const;

const fieldsLoaded = async (context: PlayContext) =>
  waitForPanelText(context, "As it appears on your passport");

function fieldsLoadedIn(mode: string) {
  return async (context: PlayContext) => {
    await fieldsLoaded(context);
    return choose(context, mode);
  };
}

export const FillMode: Story = {
  ...withFormFields,
  play: fieldsLoaded,
};

export const FillModeRequiredMissing: Story = {
  ...withFormFields,
  play: async (context) => {
    const panel = await fieldsLoaded(context);
    await userEvent.type(panel.getByPlaceholderText("Enter Email"), "a@b.co");
    const save = panel.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled(), STAGE_TIMEOUT);
    await userEvent.click(save);
    await panel.findByText("Please fill in all required fields");
  },
};

export const ReScanFieldsTooltip: Story = {
  ...withFormFields,
  play: openTooltip({ info: "Re-scan form fields" }, { after: fieldsLoaded }),
};

async function firstButton(context: PlayContext, name: string) {
  const panel = within(await waitForToolPanel(context));
  const [button] = await panel.findAllByRole("button", { name }, STAGE_TIMEOUT);
  return button;
}

export const ModifyModeWithFields: Story = {
  ...withFormFields,
  play: fieldsLoadedIn("Modify"),
};

export const GoToPageTooltip: Story = {
  ...withFormFields,
  play: openTooltip(
    { element: (context) => firstButton(context, "Go to this page") },
    { after: fieldsLoadedIn("Modify") },
  ),
};

export const DeleteFieldTooltip: Story = {
  ...withFormFields,
  play: openTooltip(
    { element: (context) => firstButton(context, "Delete") },
    { after: fieldsLoadedIn("Modify") },
  ),
};

async function deleteFirstField(context: PlayContext) {
  await fieldsLoadedIn("Modify")(context);
  await userEvent.click(await firstButton(context, "Delete"));
  await firstButton(context, "Restore");
}

export const FieldMarkedForDeletion: Story = {
  ...withFormFields,
  play: deleteFirstField,
};

export const RestoreFieldTooltip: Story = {
  ...withFormFields,
  play: openTooltip({ info: "Restore" }, { after: deleteFirstField }),
};

function editingField(name: string) {
  return async (context: PlayContext) => {
    const panel = await fieldsLoadedIn("Modify")(context);
    await userEvent.click(await panel.findByTestId(`form-modify-row-${name}`));
    await panel.findByRole("textbox", { name: /^Field name/ }, STAGE_TIMEOUT);
  };
}

export const ModifyTextField: Story = {
  ...withFormFields,
  play: editingField("fullName"),
};

export const ModifyListField: Story = {
  ...withFormFields,
  play: editingField("interests"),
};

export const ModifyRadioGroup: Story = {
  ...withFormFields,
  play: editingField("contactMethod"),
};

export const ModifyButtonField: Story = {
  ...withFormFields,
  play: editingField("submit"),
};

export const ModifySignatureField: Story = {
  ...withFormFields,
  play: editingField("applicantSignature"),
};

function fieldInfoTooltip(fieldName: string, info: string | RegExp): Story {
  return {
    ...withFormFields,
    play: openTooltip({ info }, { after: editingField(fieldName) }),
  };
}

export const FieldNameTooltip = fieldInfoTooltip(
  "fullName",
  /^The field's internal name/,
);
export const LabelTooltip = fieldInfoTooltip(
  "fullName",
  /^The wording shown to whoever fills the form/,
);
export const TypeTooltip = fieldInfoTooltip(
  "fullName",
  /^What kind of field this is/,
);
export const DefaultValueTooltip = fieldInfoTooltip(
  "fullName",
  /^What the field contains before anyone fills it in/,
);
export const FieldHintTooltip = fieldInfoTooltip(
  "fullName",
  "The hint shown when someone hovers the field in a PDF reader.",
);
export const FontSizeTooltip = fieldInfoTooltip(
  "fullName",
  /^Text size inside the field/,
);
export const MultiLineTooltip = fieldInfoTooltip(
  "fullName",
  /^Allows more than one line of text/,
);
export const MaxLengthTooltip = fieldInfoTooltip(
  "fullName",
  /^Caps how many characters fit/,
);
export const RequiredTooltip = fieldInfoTooltip(
  "fullName",
  /^The form cannot be submitted until this field is filled in/,
);
export const ReadOnlyTooltip = fieldInfoTooltip(
  "fullName",
  "Shows a value but stops anyone editing it.",
);
export const OptionsTooltip = fieldInfoTooltip(
  "interests",
  /^The choices offered in the list/,
);
export const MultipleSelectionTooltip = fieldInfoTooltip(
  "interests",
  "Lets more than one option be chosen at once.",
);
export const OptionSizeTooltip = fieldInfoTooltip(
  "contactMethod",
  /^Width and height of each button/,
);
export const OptionSpacingTooltip = fieldInfoTooltip(
  "contactMethod",
  /^Gap between buttons/,
);
export const GroupWidthTooltip = fieldInfoTooltip(
  "contactMethod",
  "Use Option size",
);
export const ButtonCaptionTooltip = fieldInfoTooltip(
  "submit",
  "The text printed on the button face.",
);
export const ButtonActionTooltip = fieldInfoTooltip(
  "submit",
  "What the button does when clicked.",
);
export const ButtonUrlTooltip = fieldInfoTooltip(
  "submit",
  "The address the button opens or submits to.",
);

async function drawTextField(context: PlayContext) {
  const panel = await fieldsLoadedIn("Create")(context);
  await userEvent.click(panel.getByRole("button", { name: "Text" }));
  await dragOnPage(
    context,
    { x: 0.5, y: 0.5 },
    { x: 0.8, y: 0.54 },
    '[data-testid="form-create-overlay-0"]',
  );
  await panel.findByRole("button", { name: "Remove field" }, STAGE_TIMEOUT);
  return panel;
}

export const PendingFields: Story = {
  ...withFormFields,
  play: drawTextField,
};

export const PendingFieldGoToTooltip: Story = {
  ...withFormFields,
  play: openTooltip({ info: "Go to this field" }, { after: drawTextField }),
};

export const PendingFieldRemoveTooltip: Story = {
  ...withFormFields,
  play: openTooltip({ info: "Remove field" }, { after: drawTextField }),
};

export const HoldToPreviewTooltip: Story = {
  ...withFormFields,
  play: openTooltip({ text: "Hold to preview" }, { after: drawTextField }),
};
