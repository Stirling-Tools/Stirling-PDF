import pageOrder from "@editor/assets/booklet/page-order.svg";
import assembly from "@editor/assets/booklet/assembly.svg";

const diagrams = {
  pageOrder: { source: pageOrder, ratio: "280 / 124" },
  assembly: { source: assembly, ratio: "280 / 88" },
};

/** Decorative line art; the adjacent guide text provides the instructions. */
export function BookletGuideDiagram({ name }: { name: keyof typeof diagrams }) {
  const { source, ratio } = diagrams[name];

  return (
    <div
      aria-hidden="true"
      style={{
        width: "100%",
        maxWidth: "280px",
        aspectRatio: ratio,
        marginInline: "auto",
        backgroundColor: "var(--c-text-muted)",
        mask: `url("${source}") center / contain no-repeat`,
      }}
    />
  );
}
