import { type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import LocalIcon from "@app/components/shared/LocalIcon";
import type {
  FlowComingSoonSource,
  FlowSource,
} from "@processor/api/processorFlow";
import {
  EDITOR_TYPE,
  ICON_SIZE,
} from "@processor/components/processor-flow/flowTypes";
import { SourceIcon } from "@processor/components/processor-flow/FlowIcons";

interface FlowSourcesProps {
  sources: FlowSource[];
  comingSoonSources: FlowComingSoonSource[];
  /** One ref slot per live source, in order, for geometry measurement. */
  srcRefs: RefObject<(HTMLElement | null)[]>;
  onOpen: () => void;
}

/** Left column: live source cards (measured) + coming-soon connect cards. */
export function FlowSources({
  sources,
  comingSoonSources,
  srcRefs,
  onOpen,
}: FlowSourcesProps) {
  const { t } = useTranslation();
  return (
    <section
      className="processor-pf__col processor-pf__col--sources"
      aria-label={t("processor.processorFlow.sources.heading")}
    >
      <span className="processor-pf__col-head">
        {t("processor.processorFlow.sources.heading")}
      </span>
      {sources.map((source, i) => (
        <Button
          key={source.id}
          variant="quiet"
          justify="start"
          fullWidth
          px="sm"
          py="sm"
          className="processor-pf__node processor-pf__node--source"
          onClick={onOpen}
          ref={(el: HTMLButtonElement | null) => {
            srcRefs.current[i] = el;
          }}
          leftSection={
            <span className="processor-pf__node-icon" aria-hidden>
              <SourceIcon type={source.type} />
            </span>
          }
        >
          <span className="processor-pf__node-text">
            <strong>
              {source.type === EDITOR_TYPE
                ? t("processor.processorFlow.sources.editor")
                : source.name}
            </strong>
            <span>
              {t("processor.processorFlow.sources.perDay", {
                n: source.docs24h,
              })}
            </span>
          </span>
        </Button>
      ))}
      {comingSoonSources.map((cs) => (
        <Button
          key={cs.key}
          variant="quiet"
          justify="start"
          fullWidth
          px="sm"
          py="sm"
          className="processor-pf__node processor-pf__node--soon"
          onClick={onOpen}
          leftSection={
            <span className="processor-pf__node-icon" aria-hidden>
              <LocalIcon icon="add" width={ICON_SIZE} />
            </span>
          }
        >
          <span className="processor-pf__node-text">
            <strong>{t(cs.labelKey)}</strong>
            <span>{t("processor.processorFlow.sources.comingSoonTag")}</span>
          </span>
        </Button>
      ))}
    </section>
  );
}
