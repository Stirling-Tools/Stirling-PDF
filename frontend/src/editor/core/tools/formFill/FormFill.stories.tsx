import type { StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse, type RequestHandler } from "msw";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  appConfig,
  fixtureResponse,
  onViewer,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  choose,
  dragOnPage,
  openSelect,
  openTooltip,
  panelOf,
  type PlayContext,
  STAGE_TIMEOUT,
  untilPanelShows,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import type {
  FormField,
  SkippedFieldEdit,
  WidgetCoordinates,
} from "@editor/tools/formFill/types";

const meta = {
  title: "Tools/Form Editor/Panel",
  ...toolPanelMeta("formFill"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const FIELDS_ENDPOINT = "*/api/v1/form/fields-with-coordinates";
const EDIT_FIELDS_ENDPOINT = "/api/v1/form/edit-fields";

export const Panel: Story = {
  play: untilPanelShows("No fillable form fields found in this PDF."),
};

export const SignedPdfLocked: Story = {
  args: { files: ["signed-sample.pdf"] },
  parameters: toolPanelServer(appConfig({ blockSignedPdfEdits: true })),
};

export const CreateMode: Story = {
  play: async (context) => {
    await choose(context, "Create");
    await waitForPanelText(context, "No fields drawn yet.");
  },
};

export const CreateModeArmed: Story = {
  play: async (context) => {
    const panel = await choose(context, "Create");
    await userEvent.click(panel.getByRole("button", { name: "Text" }));
    await waitForPanelText(
      context,
      "Draw a Text field on the page. Press Esc to stop.",
    );
  },
};

export const ModifyMode: Story = {
  play: async (context) => {
    await choose(context, "Modify");
    await waitForPanelText(context, "This PDF has no form fields yet.");
  },
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

/** The form fixture on the viewer, with the form server `handlers` answer. */
function formOnViewer(handlers: RequestHandler[], ...panelRules: string[]) {
  const viewer = onViewer(...panelRules);
  return {
    args: { ...viewer.args, files: ["form-fields-sample.pdf"] },
    parameters: { ...toolPanelServer(...handlers), ...viewer.parameters },
  } as const;
}

const serveFormFields = http.post(FIELDS_ENDPOINT, () =>
  HttpResponse.json(FORM_FIELDS),
);

// Create and Modify modes label each field on the page with a translucent chip
// whose white text falls below AA contrast once the page has drawn behind it.
const withFieldChips = formOnViewer([serveFormFields], "color-contrast");

// Fill mode's progress bar has no accessible name.
const inFillModeWithFields = formOnViewer(
  [serveFormFields],
  "aria-progressbar-name",
);

const fieldsLoaded = async (context: PlayContext) =>
  waitForPanelText(context, "As it appears on your passport");

function fieldsLoadedIn(mode: string) {
  return async (context: PlayContext) => {
    await fieldsLoaded(context);
    return choose(context, mode);
  };
}

export const FieldsLoading: Story = {
  ...formOnViewer([
    http.post(FIELDS_ENDPOINT, async () => {
      await delay("infinite");
      return new HttpResponse(null);
    }),
  ]),
  play: untilPanelShows("Analysing form fields..."),
};

export const FieldsFailedToLoad: Story = {
  ...formOnViewer([
    http.post(FIELDS_ENDPOINT, () =>
      HttpResponse.json(
        { message: "The form fields could not be read." },
        { status: 500 },
      ),
    ),
  ]),
  play: untilPanelShows("The form fields could not be read."),
};

export const NoFieldsOpensCreate: Story = {
  ...formOnViewer([http.post(FIELDS_ENDPOINT, () => HttpResponse.json([]))]),
  play: async (context) => {
    const panel = await waitForPanelText(
      context,
      "Pick a field type, then draw it on the page.",
    );
    await expect(panel.getByRole("radio", { name: "Create" })).toBeChecked();
  },
};

export const FillMode: Story = {
  ...inFillModeWithFields,
  play: fieldsLoaded,
};

export const FillModeRequiredFilled: Story = {
  ...inFillModeWithFields,
  play: async (context) => {
    const panel = await fieldsLoaded(context);
    await userEvent.type(
      panel.getByPlaceholderText("As it appears on your passport"),
      "Ada Lovelace",
    );
    await userEvent.type(panel.getByPlaceholderText("Enter Email"), "a@b.co");
    await panel.findByText("(2/2 req.)", { exact: false });
  },
};

export const FillModeRequiredMissing: Story = {
  ...inFillModeWithFields,
  play: async (context) => {
    const panel = await fieldsLoaded(context);
    await userEvent.type(panel.getByPlaceholderText("Enter Email"), "a@b.co");
    const save = panel.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled(), STAGE_TIMEOUT);
    await userEvent.click(save);
    await panel.findByText("Please fill in all required fields");
  },
};

export const FillModeFlatten: Story = {
  ...inFillModeWithFields,
  play: async (context) => {
    const panel = await fieldsLoaded(context);
    await userEvent.click(
      panel.getByRole("switch", { name: "Flatten after filling" }),
    );
    await panel.findByText("Unsaved changes");
  },
};

export const ReScanFieldsTooltip: Story = {
  ...inFillModeWithFields,
  play: openTooltip({ info: "Re-scan form fields" }, { after: fieldsLoaded }),
};

export const UnsavedChangesOnModeSwitch: Story = {
  ...inFillModeWithFields,
  play: async (context) => {
    const panel = await fieldsLoaded(context);
    await userEvent.type(panel.getByPlaceholderText("Enter Email"), "a@b.co");
    await userEvent.click(panel.getByRole("radio", { name: "Modify" }));
    await bodyOf(context).findByText(
      "You have unsaved changes to your PDF. Are you sure you want to leave?",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

async function firstButton(context: PlayContext, name: string) {
  const panel = await panelOf(context);
  const [button] = await panel.findAllByRole("button", { name }, STAGE_TIMEOUT);
  return button;
}

export const ModifyModeWithFields: Story = {
  ...withFieldChips,
  play: fieldsLoadedIn("Modify"),
};

export const ModifyPageCollapsed: Story = {
  ...withFieldChips,
  play: async (context) => {
    const panel = await fieldsLoadedIn("Modify")(context);
    const row = panel.getByTestId("form-modify-row-fullName");
    await userEvent.click(panel.getByTestId("form-page-header-0"));
    await waitFor(() => expect(row).not.toBeVisible(), STAGE_TIMEOUT);
  },
};

export const GoToPageTooltip: Story = {
  ...withFieldChips,
  play: openTooltip(
    { element: (context) => firstButton(context, "Go to this page") },
    { after: fieldsLoadedIn("Modify") },
  ),
};

export const DeleteFieldTooltip: Story = {
  ...withFieldChips,
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
  ...withFieldChips,
  play: async (context) => {
    await deleteFirstField(context);
    await waitForPanelText(context, "Save 1 change(s)");
  },
};

export const RestoreFieldTooltip: Story = {
  ...withFieldChips,
  play: openTooltip(
    { element: (context) => firstButton(context, "Restore") },
    { after: deleteFirstField },
  ),
};

async function saveDeletion(context: PlayContext) {
  await deleteFirstField(context);
  const panel = await panelOf(context);
  await userEvent.click(
    panel.getByRole("button", { name: "Save 1 change(s)" }),
  );
}

export const SaveFailed: Story = {
  ...formOnViewer(
    [
      serveFormFields,
      http.post(`*${EDIT_FIELDS_ENDPOINT}`, () =>
        HttpResponse.json(
          { message: "The form could not be saved." },
          { status: 500 },
        ),
      ),
    ],
    // The field chips' contrast, as in withFieldChips.
    "color-contrast",
  ),
  play: async (context) => {
    await saveDeletion(context);
    await waitForPanelText(context, "The form could not be saved.");
  },
};

const SKIPPED_EDITS: SkippedFieldEdit[] = [
  {
    operation: "delete",
    target: "fullName",
    reason: "The field is locked by the document.",
  },
];

export const SomeEditsSkipped: Story = {
  ...formOnViewer(
    [
      serveFormFields,
      fixtureResponse(EDIT_FIELDS_ENDPOINT, "form-fields-sample.pdf", {
        "X-Stirling-Skipped-Field-Edits": btoa(JSON.stringify(SKIPPED_EDITS)),
        "X-Stirling-Skipped-Field-Edits-Total": "3",
      }),
    ],
    // The field chips' contrast, as in withFieldChips.
    "color-contrast",
  ),
  play: async (context) => {
    await saveDeletion(context);
    await waitForPanelText(context, "2 more not listed.");
  },
};

function editingField(name: string) {
  return async (context: PlayContext) => {
    const panel = await fieldsLoadedIn("Modify")(context);
    await userEvent.click(await panel.findByTestId(`form-modify-row-${name}`));
    await panel.findByRole("textbox", { name: "Field name" }, STAGE_TIMEOUT);
    return panel;
  };
}

export const ModifyTextField: Story = {
  ...withFieldChips,
  play: editingField("fullName"),
};

export const ModifyTextFieldEdited: Story = {
  ...withFieldChips,
  play: async (context) => {
    const panel = await editingField("fullName")(context);
    await userEvent.type(
      panel.getByRole("textbox", { name: "Label" }),
      " (as on passport)",
    );
    await waitFor(
      () =>
        expect(
          panel.getByRole("button", { name: "Save 1 change(s)" }),
        ).toBeEnabled(),
      STAGE_TIMEOUT,
    );
  },
};

export const ModifyTypeMenu: Story = {
  ...withFieldChips,
  play: async (context) => {
    await editingField("fullName")(context);
    const options = await openSelect(context, "Type");
    await options.findByRole("option", { name: "List box" });
  },
};

export const ModifyCheckboxField: Story = {
  ...withFieldChips,
  play: editingField("subscribe"),
};

export const ModifyDropdownField: Story = {
  ...withFieldChips,
  play: editingField("country"),
};

export const ModifyListField: Story = {
  ...withFieldChips,
  play: editingField("interests"),
};

export const ModifyListOptionAdded: Story = {
  ...withFieldChips,
  play: async (context) => {
    const panel = await editingField("interests")(context);
    await userEvent.click(panel.getByRole("button", { name: "Add option" }));
    await panel.findByPlaceholderText("Option 4");
  },
};

export const ModifyListNoOptions: Story = {
  ...withFieldChips,
  play: async (context) => {
    const panel = await editingField("interests")(context);
    const removeButtons = () =>
      panel.queryAllByRole("button", { name: "Remove option" });
    while (removeButtons().length > 0)
      await userEvent.click(removeButtons()[0]);
    await panel.findByText("Add at least one option.");
  },
};

export const ModifyRadioGroup: Story = {
  ...withFieldChips,
  play: async (context) => {
    const panel = await editingField("contactMethod")(context);
    await panel.findByText("Use Option size");
  },
};

export const ModifyButtonField: Story = {
  ...withFieldChips,
  play: editingField("submit"),
};

export const ModifyButtonActionMenu: Story = {
  ...withFieldChips,
  play: async (context) => {
    await editingField("submit")(context);
    const options = await openSelect(context, "Button action");
    await options.findByRole("option", { name: "Submit to URL" });
  },
};

export const ModifySignatureField: Story = {
  ...withFieldChips,
  play: editingField("applicantSignature"),
};

function labelTooltip(fieldName: string, label: string): Story {
  return {
    ...withFieldChips,
    play: openTooltip({ text: label }, { after: editingField(fieldName) }),
  };
}

/**
 * A switch's help tooltip hangs on its input, which Mantine stretches invisibly
 * over the track, so the pointer reaches it on the track rather than the label.
 */
function switchTooltip(fieldName: string, name: string): Story {
  return {
    ...withFieldChips,
    play: openTooltip(
      {
        element: async (context) =>
          (await panelOf(context)).findByRole("switch", {
            name,
          }),
      },
      { after: editingField(fieldName) },
    ),
  };
}

export const FieldNameTooltip = labelTooltip("fullName", "Field name");
export const LabelTooltip = labelTooltip("fullName", "Label");
export const TypeTooltip = labelTooltip("fullName", "Type");
export const DefaultValueTooltip = labelTooltip("fullName", "Default value");
export const FieldTooltipTooltip = labelTooltip("fullName", "Tooltip");
export const FontSizeTooltip = labelTooltip("fullName", "Font size");
export const MaxLengthTooltip = labelTooltip("fullName", "Max length (comb)");
export const MultiLineTooltip = switchTooltip("fullName", "Multi-line");
export const RequiredTooltip = switchTooltip("fullName", "Required");
export const ReadOnlyTooltip = switchTooltip("fullName", "Read-only");
export const OptionsTooltip = labelTooltip("interests", "Options");
export const MultipleSelectionTooltip = switchTooltip(
  "interests",
  "Allow multiple selection",
);
export const OptionSizeTooltip = labelTooltip("contactMethod", "Option size");
export const OptionSpacingTooltip = labelTooltip(
  "contactMethod",
  "Option spacing",
);
export const ButtonCaptionTooltip = labelTooltip("submit", "Button caption");
export const ButtonActionTooltip = labelTooltip("submit", "Button action");
export const ButtonUrlTooltip = labelTooltip("submit", "URL");

function drawField(type: string) {
  return async (context: PlayContext) => {
    const panel = await fieldsLoadedIn("Create")(context);
    await userEvent.click(panel.getByRole("button", { name: type }));
    await dragOnPage(
      context,
      { x: 0.5, y: 0.5 },
      { x: 0.8, y: 0.6 },
      '[data-testid="form-create-overlay-0"]',
    );
    await panel.findByRole("button", { name: "Remove field" }, STAGE_TIMEOUT);
    return panel;
  };
}

const drawTextField = drawField("Text");

export const PendingTextField: Story = {
  ...withFieldChips,
  play: drawTextField,
};

export const PendingCheckboxField: Story = {
  ...withFieldChips,
  play: drawField("Checkbox"),
};

export const PendingDropdownField: Story = {
  ...withFieldChips,
  play: drawField("Dropdown"),
};

export const PendingListField: Story = {
  ...withFieldChips,
  play: drawField("List box"),
};

export const PendingRadioGroup: Story = {
  ...withFieldChips,
  play: drawField("Radio"),
};

export const PendingButtonField: Story = {
  ...withFieldChips,
  play: drawField("Button"),
};

export const PendingSignatureField: Story = {
  ...withFieldChips,
  play: drawField("Signature"),
};

export const PendingFieldsInModify: Story = {
  ...withFieldChips,
  play: async (context) => {
    await drawTextField(context);
    const panel = await choose(context, "Modify");
    await panel.findByRole("button", { name: "Remove field" }, STAGE_TIMEOUT);
  },
};

export const PendingFieldGoToTooltip: Story = {
  ...withFieldChips,
  play: openTooltip({ info: "Go to this field" }, { after: drawTextField }),
};

export const PendingFieldRemoveTooltip: Story = {
  ...withFieldChips,
  play: openTooltip({ info: "Remove field" }, { after: drawTextField }),
};

export const HoldToPreviewTooltip: Story = {
  ...withFieldChips,
  play: openTooltip({ text: "Hold to preview" }, { after: drawTextField }),
};
