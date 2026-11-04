import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  FieldGroup,
  OnOffControl,
  SettingRow,
  SetupNote,
  TextField,
} from "@editor/components/serverSetup/SetupFields";
import { SetupScreen } from "@editor/components/serverSetup/SetupScreen";
import { SetupStepFrame } from "@editor/components/serverSetup/SetupStepFrame";
import styles from "@editor/components/shared/setupCard/SetupCard.module.css";
// The app loads the card's colours globally (App.tsx); a story has to load them itself.
import "@editor/auth/ui/auth-theme.css";

/**
 * The building blocks of a setup card. Settings sit in a flat list; one that
 * opens more fields is boxed, even while off, and its box reaches out by its
 * own padding so every label and control stays in one column.
 */
const meta = {
  title: "Server Setup/Setting Rows",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** Rows only line up inside a card: the frame sets how far a box reaches out. */
function InCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SetupScreen>
      <SetupStepFrame
        title={title}
        primaryLabel="Continue"
        onPrimary={() => {}}
      >
        {children}
      </SetupStepFrame>
    </SetupScreen>
  );
}

function OnOffRow({ label, start }: { label: string; start: boolean }) {
  const [on, setOn] = useState(start);
  return (
    <SettingRow label={label}>
      {() => <OnOffControl ariaLabel={label} value={on} onChange={setOn} />}
    </SettingRow>
  );
}

function ModelField() {
  const [model, setModel] = useState("voyage-3.5");
  return (
    <TextField
      required
      label="Embedding model"
      value={model}
      onChange={setModel}
    />
  );
}

function SmtpFields() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  return (
    <>
      <TextField
        required
        label="SMTP host"
        value={host}
        onChange={setHost}
        placeholder="smtp.example.com"
      />
      <TextField required label="Port" value={port} onChange={setPort} />
    </>
  );
}

/** A setting that opens fields when on: boxed either way, with a chevron once on. */
function ExpandableRow({
  label,
  start,
  fields = <SmtpFields />,
}: {
  label: string;
  start: boolean;
  fields?: ReactNode;
}) {
  const [on, setOn] = useState(start);
  const [open, setOpen] = useState(start);
  return (
    <SettingRow
      label={label}
      expand={
        on
          ? {
              open,
              onToggle: () => setOpen(!open),
              onSave: () => setOpen(false),
            }
          : undefined
      }
      details={fields}
    >
      {() => (
        <OnOffControl
          ariaLabel={label}
          value={on}
          onChange={(next) => {
            setOn(next);
            setOpen(next);
          }}
        />
      )}
    </SettingRow>
  );
}

export const Flat: Story = {
  render: () => (
    <InCard title="Files">
      <OnOffRow label="Store files" start />
      <OnOffRow label="File sharing" start={false} />
    </InCard>
  ),
};

export const BoxedWhileOff: Story = {
  render: () => (
    <InCard title="Email">
      <ExpandableRow label="Send email" start={false} />
    </InCard>
  ),
};

export const BoxedAndOpen: Story = {
  render: () => (
    <InCard title="Email">
      <ExpandableRow label="Send email" start />
    </InCard>
  ),
};

function AddressFields() {
  const [web, setWeb] = useState("https://pdf.example.com");
  return (
    <FieldGroup>
      <TextField required label="Web address" value={web} onChange={setWeb} />
    </FieldGroup>
  );
}

/** Fields, flat rows and boxed rows together: labels and controls share one column. */
export const Mixed: Story = {
  render: () => (
    <InCard title="Quick start">
      <AddressFields />
      <ExpandableRow label="Send email" start={false} />
      <OnOffRow label="MCP server" start />
      <ExpandableRow label="Document questions" start fields={<ModelField />} />
    </InCard>
  ),
};

export const WithNote: Story = {
  render: () => (
    <InCard title="Files">
      <OnOffRow label="Store files" start={false} />
      <SetupNote tone="warning">
        <p className={styles.noteText}>
          With storage off, files people saved on the server can no longer be
          opened.
        </p>
      </SetupNote>
    </InCard>
  ),
};
