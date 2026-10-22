import { MantineProvider } from "@mantine/core";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StampSetupSettings from "@app/components/tools/addStamp/StampSetupSettings";
import { defaultParameters } from "@app/components/tools/addStamp/useAddStampParameters";

describe("StampSetupSettings image preview", () => {
  const onParameterChange = vi.fn();
  const stampImage = new File(["image"], "stamp.png", {
    type: "image/png",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderImageStamp = () =>
    render(
      <MantineProvider>
        <StampSetupSettings
          parameters={{
            ...defaultParameters,
            stampType: "image",
            stampImage,
          }}
          onParameterChange={onParameterChange}
        />
      </MantineProvider>,
    );

  it("creates one preview URL per selected image, not per render", () => {
    const createObjectURL = vi.mocked(URL.createObjectURL);
    const { rerender } = renderImageStamp();

    expect(createObjectURL).toHaveBeenCalledTimes(1);

    rerender(
      <MantineProvider>
        <StampSetupSettings
          parameters={{
            ...defaultParameters,
            stampType: "image",
            stampImage,
            pageNumbers: "2",
          }}
          onParameterChange={onParameterChange}
        />
      </MantineProvider>,
    );

    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("revokes the preview URL when the component unmounts", () => {
    const revokeObjectURL = vi.mocked(URL.revokeObjectURL);
    const { unmount } = renderImageStamp();

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
