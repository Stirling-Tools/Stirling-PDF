import { PageLayoutParameters } from "@app/hooks/tools/pageLayout/usePageLayoutParameters";
import LayoutPreview from "@app/components/tools/pageLayout/LayoutPreview";
import { Stack } from "@mantine/core";

export default function PageLayoutPreview({
  parameters,
}: {
  parameters: PageLayoutParameters;
}) {
  return (
    <Stack gap="sm">
      <LayoutPreview parameters={parameters} />
    </Stack>
  );
}
