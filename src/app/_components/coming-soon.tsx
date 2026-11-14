import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  COMING_FORMATS,
  COMING_FORMAT_STATUS_LABEL,
  SHIPPED_CAPABILITIES,
  comingFormatDoneCount,
  comingFormatProgress,
  comingFormatsInMotion,
  type ComingFormat,
} from "~/lib/coming-formats";
import { cn } from "~/lib/utils";

export function ComingSoon({ className }: { className?: string }) {
  const inMotion = comingFormatsInMotion();

  return (
    <div className={cn("lamp-soon", className)}>
      <style>{lampSoonStyles}</style>
      <div className="lamp-soon__glow" aria-hidden="true" />
      <div className="lamp-soon__grain" aria-hidden="true" />

      <div className="lamp-soon__page">
        <Link href="/preferences" className="lamp-soon__back lamp-soon__in">
          <ArrowLeft className="size-3.5" />
          Preferences
        </Link>

        <header className="lamp-soon__in lamp-soon__in--1">
          <p className="lamp-soon__kicker">Read after dark</p>
          <h1 className="lamp-soon__title">
            Coming<i>next</i>
          </h1>
          <p className="lamp-soon__lede">
            More than articles, if it can become a document.
          </p>

          <div className="lamp-soon__legend">
            <p
              className="lamp-soon__wicks"
              role="img"
              aria-label={`${SHIPPED_CAPABILITIES.length} already here`}
            >
              {SHIPPED_CAPABILITIES.map((item) => (
                <span
                  key={item.id}
                  className="lamp-soon__wick lamp-soon__wick--on"
                />
              ))}
              <span className="lamp-soon__wicks-label">
                {SHIPPED_CAPABILITIES.length} here
              </span>
            </p>
            <p
              className="lamp-soon__wicks"
              role="img"
              aria-label={`${inMotion} of ${COMING_FORMATS.length} formats in motion`}
            >
              {COMING_FORMATS.map((format) => (
                <span
                  key={format.id}
                  className={
                    format.status === "underway"
                      ? "lamp-soon__wick lamp-soon__wick--on"
                      : "lamp-soon__wick"
                  }
                />
              ))}
              <span className="lamp-soon__wicks-label">
                {inMotion} of {COMING_FORMATS.length} in motion
              </span>
            </p>
          </div>
        </header>

        <section aria-labelledby="already-here-heading">
          <h2 className="lamp-soon__section" id="already-here-heading">
            Already here
          </h2>
          <ol className="lamp-soon__list">
            {SHIPPED_CAPABILITIES.map((format, index) => (
              <FormatRow key={format.id} format={format} index={index} />
            ))}
          </ol>
        </section>

        <section aria-labelledby="coming-next-heading">
          <h2 className="lamp-soon__section" id="coming-next-heading">
            Coming next
          </h2>
          <ol className="lamp-soon__list">
            {COMING_FORMATS.map((format, index) => (
              <FormatRow
                key={format.id}
                format={format}
                index={SHIPPED_CAPABILITIES.length + index}
              />
            ))}
          </ol>
        </section>

        <footer
          className="lamp-soon__footer lamp-soon__in"
          style={{ animationDelay: "640ms" }}
        >
          That is the list. Not a player. If you cannot highlight it, it does
          not belong here yet.
        </footer>
      </div>
    </div>
  );
}

function FormatRow({ format, index }: { format: ComingFormat; index: number }) {
  const progress = comingFormatProgress(format);
  const done = comingFormatDoneCount(format);
  const lit = progress > 0;

  return (
    <li
      className="lamp-soon__item lamp-soon__in"
      style={{ animationDelay: `${160 + index * 70}ms` }}
    >
      <span className="lamp-soon__idx">
        {format.index || (
          <span
            className="lamp-soon__wick lamp-soon__wick--on"
            aria-hidden="true"
          />
        )}
      </span>
      <div>
        <div className="lamp-soon__row">
          <h3>{format.title}</h3>
          <span
            className={
              lit
                ? "lamp-soon__status lamp-soon__status--on"
                : "lamp-soon__status"
            }
          >
            {COMING_FORMAT_STATUS_LABEL[format.status]}
            {format.steps.length > 0
              ? ` · ${done} / ${format.steps.length}`
              : ""}
          </span>
        </div>
        <p className="lamp-soon__promise">{format.promise}</p>

        <div className="lamp-soon__progress">
          <div
            className="lamp-soon__rail"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label={`${format.title} ${progress} percent`}
          >
            <span
              className={
                lit ? "lamp-soon__fill lamp-soon__fill--on" : "lamp-soon__fill"
              }
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="lamp-soon__stage">{format.stage}</p>
        </div>

        {format.steps.length > 0 ? (
          <ol className="lamp-soon__steps" aria-label={`${format.title} steps`}>
            {format.steps.map((step) => (
              <li
                key={step.label}
                className={
                  step.done
                    ? "lamp-soon__step lamp-soon__step--on"
                    : "lamp-soon__step"
                }
              >
                <span className="lamp-soon__dot" />
                {step.label}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </li>
  );
}

const lampSoonStyles = `
  .lamp-soon {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    min-height: calc(100dvh - 3.5rem);
    color: #f0e2c4;
    background: #0c0a08;
    font-family: var(--font-cormorant), var(--font-newsreader), ui-serif, Georgia, serif;
  }
  .lamp-soon__glow {
    pointer-events: none;
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 80% 55% at 50% -8%, rgba(232,176,88,0.22), transparent 58%),
      radial-gradient(ellipse 40% 30% at 80% 100%, rgba(120,70,20,0.12), transparent 60%);
  }
  .lamp-soon__grain {
    pointer-events: none;
    position: absolute;
    inset: 0;
    opacity: 0.11;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .lamp-soon__page {
    position: relative;
    max-width: 42rem;
    margin: 0 auto;
    padding: 1.6rem 1.4rem 3.5rem;
  }
  .lamp-soon__back {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-barlow-condensed), ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    font-size: 0.78rem;
    color: #b89a6a;
    text-decoration: none;
  }
  .lamp-soon__back:hover { color: #f0e2c4; }
  .lamp-soon header { margin: 3rem 0 2.2rem; }
  .lamp-soon__kicker {
    font-family: var(--font-barlow-condensed), ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    font-size: 0.78rem;
    color: #d4a24a;
    margin: 0 0 1rem;
  }
  .lamp-soon__title {
    margin: 0;
    font-size: clamp(4.4rem, 16vw, 7.2rem);
    font-weight: 500;
    line-height: 0.78;
    letter-spacing: -0.045em;
  }
  .lamp-soon__title i {
    display: block;
    font-style: italic;
    font-weight: 400;
    color: #e8b45a;
    padding-left: 2.6rem;
  }
  .lamp-soon__lede {
    margin: 1.3rem 0 0;
    max-width: 24ch;
    font-size: 1.35rem;
    font-style: italic;
    color: #d8c6a2;
    line-height: 1.25;
  }
  .lamp-soon__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem 1.6rem;
    margin-top: 1.6rem;
  }
  .lamp-soon__wicks {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin: 0;
  }
  .lamp-soon__section {
    font-family: var(--font-barlow-condensed), ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    font-size: 0.72rem;
    font-weight: 600;
    color: #d4a24a;
    margin: 2.4rem 0 0.2rem;
  }
  .lamp-soon__wick {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 999px;
    background: rgba(232,180,90,0.18);
    box-shadow: inset 0 0 0 1px rgba(232,180,90,0.28);
  }
  .lamp-soon__wick--on {
    background: #e8b45a;
    box-shadow: 0 0 14px 4px rgba(232,180,90,0.42);
  }
  .lamp-soon__wicks-label {
    margin-left: 0.35rem;
    font-family: var(--font-barlow-condensed), ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-size: 0.75rem;
    color: #8d7350;
  }
  .lamp-soon__list { list-style: none; margin: 0; padding: 0; }
  .lamp-soon__item {
    display: grid;
    grid-template-columns: 3.2rem 1fr;
    gap: 0.4rem 1rem;
    padding: 1.35rem 0 1.5rem;
    border-top: 1px solid rgba(232,180,90,0.16);
  }
  .lamp-soon__idx {
    display: flex;
    align-items: flex-start;
    font-family: var(--font-barlow-condensed), ui-sans-serif, system-ui, sans-serif;
    font-size: 1.05rem;
    letter-spacing: 0.16em;
    color: #d4a24a;
    padding-top: 0.85rem;
  }
  .lamp-soon__item h3 {
    margin: 0;
    font-size: clamp(2.1rem, 6vw, 2.85rem);
    font-weight: 500;
    letter-spacing: -0.03em;
    line-height: 0.95;
  }
  .lamp-soon__row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
  }
  .lamp-soon__status {
    font-family: var(--font-barlow-condensed), ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    font-size: 0.75rem;
    color: #8d7350;
    white-space: nowrap;
  }
  @media (max-width: 640px) {
    .lamp-soon__status { white-space: normal; text-align: right; max-width: 8rem; }
  }
  .lamp-soon__status--on { color: #e8b45a; }
  .lamp-soon__promise {
    margin: 0.35rem 0 0;
    color: #cbb892;
    font-size: 1.08rem;
    line-height: 1.35;
    max-width: 40ch;
  }
  .lamp-soon__progress { margin-top: 0.95rem; max-width: 28rem; }
  .lamp-soon__rail {
    position: relative;
    height: 2px;
    background: rgba(232,180,90,0.16);
    overflow: hidden;
  }
  .lamp-soon__fill {
    display: block;
    height: 100%;
    background: rgba(232,180,90,0.28);
    transform-origin: left center;
  }
  .lamp-soon__fill--on {
    background: #e8b45a;
    box-shadow: 0 0 10px 1px rgba(232,180,90,0.55);
    animation: lamp-fill 1.1s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .lamp-soon__stage {
    margin: 0.45rem 0 0;
    font-family: var(--font-barlow-condensed), ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-size: 0.72rem;
    color: #8d7350;
  }
  .lamp-soon__steps {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 1rem;
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
  }
  .lamp-soon__step {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-barlow-condensed), ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-size: 0.68rem;
    color: #6e5a40;
  }
  .lamp-soon__step--on { color: #e8b45a; }
  .lamp-soon__dot {
    width: 0.38rem;
    height: 0.38rem;
    border-radius: 999px;
    background: rgba(232,180,90,0.2);
    box-shadow: inset 0 0 0 1px rgba(232,180,90,0.28);
  }
  .lamp-soon__step--on .lamp-soon__dot {
    background: #e8b45a;
    box-shadow: 0 0 8px 2px rgba(232,180,90,0.4);
  }
  .lamp-soon__footer {
    margin-top: 2.4rem;
    max-width: 28ch;
    font-size: 1.2rem;
    font-style: italic;
    color: #d8c6a2;
    line-height: 1.35;
  }
  .lamp-soon__in {
    animation: coming-rise 740ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .lamp-soon__in--1 { animation-delay: 40ms; }
  @keyframes coming-rise {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: none; }
  }
  @keyframes lamp-fill {
    from { transform: scaleX(0); }
    to { transform: scaleX(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .lamp-soon__in, .lamp-soon__fill--on { animation: none; }
  }
`;
