import { useState } from "react";
import { Button, EmptyState, Skeleton } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useView } from "@portal/contexts/ViewContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchGettingStarted,
  type GettingStartedResponse,
  type UseCase,
} from "@portal/api/gettingStarted";
import { StepIndicator } from "@portal/components/getting-started/StepIndicator";
import { UseCasePicker } from "@portal/components/getting-started/UseCasePicker";
import { DocumentAnalyzer } from "@portal/components/getting-started/DocumentAnalyzer";
import { GoLivePanel } from "@portal/components/getting-started/GoLivePanel";
import "@portal/views/GettingStarted.css";

const STEPS = ["Pick a use case", "Analyze a document", "Go live"];

/**
 * Getting Started — a guided 3-step funnel to first value: pick a use case,
 * analyze a test document, then go live with a key and snippets. Step progress
 * is local component state; the catalogue is tier-aware and fetched once.
 */
export function GettingStarted() {
  const { tier } = useTier();
  const { setActiveView } = useView();
  const state = useAsync<GettingStartedResponse>(
    () => fetchGettingStarted(tier),
    [tier],
  );
  const { data } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const [step, setStep] = useState(0);
  const [useCase, setUseCase] = useState<UseCase | null>(null);
  // Gates step 3 — the analysis must finish before go-live unlocks.
  const [analyzed, setAnalyzed] = useState(false);

  function selectUseCase(uc: UseCase) {
    setUseCase(uc);
    setStep(1);
  }

  return (
    <div className="portal-gs">
      <header className="portal-gs__head">
        <h1 className="portal-gs__title">Getting started</h1>
        <p className="portal-gs__sub">
          Three steps to your first processed document — pick what you&rsquo;re
          building, try it on a real file, then ship it with a live key.
        </p>
      </header>

      <StepIndicator
        steps={STEPS}
        current={step}
        // Allow hopping back to a completed step; forward jumps stay gated.
        onStepClick={(i) => setStep(i)}
      />

      {isLoading && (
        <div className="portal-gs__skeleton" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height="9rem" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          title="Onboarding is unavailable"
          description="We couldn't load the getting-started catalogue. Try again in a moment."
        />
      )}

      {!isLoading && !isEmpty && data && (
        <div className="portal-gs__body">
          {step === 0 && (
            <UseCasePicker
              useCases={data.useCases}
              selectedId={useCase?.id ?? null}
              onSelect={selectUseCase}
            />
          )}

          {step === 1 && (
            <section className="portal-gs__panel">
              <div className="portal-gs__panel-head">
                <h2 className="portal-gs__panel-title">
                  {useCase
                    ? `Test the ${useCase.title} pipeline`
                    : "Analyze a document"}
                </h2>
                <p className="portal-gs__panel-sub">
                  Drop a document — Stirling detects its type, scans for PII,
                  evaluates extraction, and assembles a runnable pipeline.
                </p>
              </div>
              <DocumentAnalyzer
                stages={data.stages}
                onComplete={() => setAnalyzed(true)}
              />
              <div className="portal-gs__panel-foot">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  disabled={!analyzed}
                  trailingIcon={<span aria-hidden>→</span>}
                >
                  Continue
                </Button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="portal-gs__panel">
              <div className="portal-gs__panel-head">
                <h2 className="portal-gs__panel-title">Go live</h2>
                <p className="portal-gs__panel-sub">
                  Use this sandbox key to make your first request. Swap in a
                  production key from Infrastructure when you&rsquo;re ready.
                </p>
              </div>
              <GoLivePanel
                sampleKey={data.sampleKey}
                snippets={data.snippets}
                // No dedicated dashboard route yet — land the new dev on Home.
                onDone={() => setActiveView("home")}
              />
              <div className="portal-gs__panel-foot">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Back
                </Button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
