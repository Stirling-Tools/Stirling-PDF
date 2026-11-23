import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  HOSTS_ENTERPRISE_DEAL,
  useOpenEnterprise,
} from "@processor/components/procurement/enterpriseEntry";

function Probe() {
  const open = useOpenEnterprise();
  const { pathname } = useLocation();
  return (
    <>
      <button onClick={open}>Open</button>
      <output data-testid="location">{pathname}</output>
    </>
  );
}

describe("hosted useOpenEnterprise", () => {
  it("opens the Enterprise page within the app, which runs the deal", () => {
    render(
      <MemoryRouter initialEntries={["/settings/billing"]}>
        <Probe />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/enterprise");
    expect(HOSTS_ENTERPRISE_DEAL).toBe(true);
  });
});
