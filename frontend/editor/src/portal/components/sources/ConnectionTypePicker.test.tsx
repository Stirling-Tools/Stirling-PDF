import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConnectionTypePicker } from "@portal/components/sources/ConnectionTypePicker";
import { CREATABLE_CONNECTION_TYPES } from "@portal/components/sources/connectionTypes";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const wrap = (ui: React.ReactNode) => <MantineProvider>{ui}</MantineProvider>;

const typesFor = (...ids: string[]) =>
  CREATABLE_CONNECTION_TYPES.filter((type) => ids.includes(type.id));

const INFO = "portal.connections.picker2.tasksInfo";

describe("ConnectionTypePicker task info", () => {
  it("offers an (i) only for integrations that add tasks", () => {
    render(
      wrap(
        <ConnectionTypePicker
          types={typesFor("jira", "s3")}
          onPick={vi.fn()}
        />,
      ),
    );
    // Jira adds tasks, so its card gets one info button; S3 (a bucket) adds none.
    expect(screen.getAllByRole("button", { name: INFO })).toHaveLength(1);
  });

  it("reveals the tasks an integration unlocks, and hides them again", async () => {
    render(
      wrap(<ConnectionTypePicker types={typesFor("jira")} onPick={vi.fn()} />),
    );

    expect(
      screen.queryByText("portal.policies.operations.jiraComment.label"),
    ).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: INFO }));
    expect(
      screen.getByText("portal.policies.operations.jiraAttach.label"),
    ).toBeTruthy();
    expect(
      screen.getByText("portal.policies.operations.jiraComment.label"),
    ).toBeTruthy();
    expect(
      screen.getByText("portal.policies.operations.jiraTransition.label"),
    ).toBeTruthy();

    // Clicking the (i) again collapses the list.
    await userEvent.click(screen.getByRole("button", { name: INFO }));
    expect(
      screen.queryByText("portal.policies.operations.jiraComment.label"),
    ).toBeNull();
  });

  it("picks the integration when the card itself is clicked, not the (i)", async () => {
    const onPick = vi.fn();
    render(
      wrap(<ConnectionTypePicker types={typesFor("jira")} onPick={onPick} />),
    );

    await userEvent.click(
      screen.getByText("portal.connections.types.jira.label"),
    );
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].id).toBe("jira");
  });
});
