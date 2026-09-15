import { describe, expect, it } from "vitest";

import {
  INTEGRATION_ENDPOINT,
  integrationStepConfigured,
  isIntegrationStep,
  newIntegrationStep,
  stepOperation,
} from "@portal/components/pipelines/integrationStep";
import {
  buildStepParameters,
  operationById,
} from "@portal/components/policies/stepOperations";
import {
  serializeToolStep,
  type WorkingToolStep,
} from "@app/hooks/tools/shared/toolAutomation";

describe("integration steps in a pipeline", () => {
  it("creates a step the backend will dispatch generically", () => {
    const step = newIntegrationStep(operationById("discordNotify")!);

    expect(step.toolId).toBeNull();
    expect(step.operation).toBe(INTEGRATION_ENDPOINT);
    expect(isIntegrationStep(step)).toBe(true);
  });

  it("survives serialisation verbatim, so the saved pipeline keeps its config", () => {
    // toolId null takes serializeToolStep's unmapped path; if that ever changed, an integration
    // step would be rewritten on save and silently lose its parameters.
    const op = operationById("jiraAttach")!;
    const step = newIntegrationStep(op);
    // Configure it the way the inspector does: rebuild from the catalogue with real answers.
    step.params = buildStepParameters(op, "12", {
      issueKey: "OPS-42",
    }) as never;

    const wire = serializeToolStep(step, {});

    expect(wire.operation).toBe(INTEGRATION_ENDPOINT);
    expect(wire.parameters.connectionId).toBe("12");
    expect(wire.parameters.path).toBe("/rest/api/3/issue/OPS-42/attachments");
    expect(JSON.parse(wire.parameters.headers as string)).toEqual({
      "X-Atlassian-Token": "no-check",
    });
  });

  it("leaves an unfilled field blank rather than shipping the placeholder", () => {
    // A freshly added step is deliberately unconfigured. What matters is that {{issueKey}} does
    // not survive into the wire call, where Jira would receive it as a literal path segment.
    const step = newIntegrationStep(operationById("jiraAttach")!);
    expect(step.params.path).not.toContain("{{");
    expect(integrationStepConfigured(step)).toBe(false);
  });

  it("remembers which operation it is, so the builder can name and edit it", () => {
    const step = newIntegrationStep(operationById("splunkEvent")!);
    expect(stepOperation(step)?.id).toBe("splunkEvent");
  });

  it("is not configured until an account is chosen", () => {
    const step = newIntegrationStep(operationById("clamavScan")!);
    // Created deliberately blank so the operator sees it in the chain and fills it in.
    expect(integrationStepConfigured(step)).toBe(false);

    (step.params as Record<string, unknown>).connectionId = "4";
    expect(integrationStepConfigured(step)).toBe(true);
  });

  it("is not configured while an answer references something the run cannot fill in", () => {
    const op = operationById("discordNotify")!;
    const step = newIntegrationStep(op);
    step.params = buildStepParameters(op, "4", {
      message: "did {{document.flename}}",
    }) as never;
    expect(integrationStepConfigured(step)).toBe(false);

    step.params = buildStepParameters(op, "4", {
      message: "did {{document.filename}}",
    }) as never;
    expect(integrationStepConfigured(step)).toBe(true);
  });

  it("rejects a steps reference at or past the step's own position", () => {
    const op = operationById("discordNotify")!;
    const step = newIntegrationStep(op);
    step.params = buildStepParameters(op, "4", {
      message: "see {{steps.1.body.ocs.data.url}}",
    }) as never;
    // Fine as step 2 (step 1 ran before it); a self-reference as step 1 fails every run.
    expect(integrationStepConfigured(step, 2)).toBe(true);
    expect(integrationStepConfigured(step, 1)).toBe(false);
  });

  it("is not configured while the size cap is unparseable", () => {
    const op = operationById("discordAttach")!;
    const step = newIntegrationStep(op);
    step.params = buildStepParameters(op, "4", {
      message: "",
      maxFileMb: "abc",
    }) as never;
    expect(integrationStepConfigured(step)).toBe(false);

    step.params = buildStepParameters(op, "4", {
      message: "",
      maxFileMb: "25",
    }) as never;
    expect(integrationStepConfigured(step)).toBe(true);
  });

  it("leaves ordinary tool steps alone", () => {
    const toolStep = {
      toolId: "compress",
      operation: "/api/v1/misc/compress-pdf",
      params: {},
      support: "supported",
    } as unknown as WorkingToolStep;
    expect(isIntegrationStep(toolStep)).toBe(false);
    expect(stepOperation(toolStep)).toBeUndefined();
    expect(integrationStepConfigured(toolStep)).toBe(true);
  });
});
