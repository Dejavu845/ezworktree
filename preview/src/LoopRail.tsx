import { LOOP_LABEL, LOOP_STEPS, type LoopStep, type LoopView } from "./loop";

export function LoopRail({
  loop,
  onStep,
}: {
  loop: LoopView;
  onStep: (step: LoopStep) => void;
}) {
  return (
    <section className="loop-rail" aria-label="任务闭环">
      <p className="eyebrow">闭环</p>
      <ol>
        {LOOP_STEPS.map((step, index) => (
          <li key={step}>
            {index ? <span className="arrow" aria-hidden /> : null}
            <button
              type="button"
              className={`${loop.lit[step] ? "lit" : ""} ${loop.current === step ? "on" : ""}`}
              onClick={() => onStep(step)}
            >
              <em>{LOOP_LABEL[step]}</em>
            </button>
          </li>
        ))}
      </ol>
      <p className="hint">{loop.hint}</p>
    </section>
  );
}
