"use client";

import React from "react";

type SliderProps = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
};

function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100000,
  step = 500,
  suffix = "",
}: SliderProps) {
  const id = React.useId();
  const [dragging, setDragging] = React.useState(false);
  const percent = Math.max(
    0,
    Math.min(100, ((value - min) / (max - min)) * 100)
  );

  React.useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchend", stop);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchend", stop);
      window.removeEventListener("pointerup", stop);
    };
  }, [dragging]);

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
      <div className="w-full sm:w-56 md:w-72 shrink-0">
        <label htmlFor={id} className="text-sm font-medium block">
          {label}
        </label>
        <div className="mt-1 text-xs sm:text-sm text-muted-foreground tabular-nums truncate">
          {value.toLocaleString()} {suffix}
        </div>
      </div>
      <div className="relative flex-1">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onMouseDown={() => setDragging(true)}
          onTouchStart={() => setDragging(true)}
          onPointerDown={() => setDragging(true)}
          className="w-full accent-primary"
          aria-label={label}
          aria-valuetext={`${value.toLocaleString()} ${suffix}`}
        />
        {dragging && (
          <div
            className="pointer-events-none absolute -top-9 left-0 -translate-x-1/2"
            style={{ left: `${percent}%` }}
          >
            <div className="rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background tabular-nums shadow whitespace-nowrap">
              {value.toLocaleString()} {suffix}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function PricingCalculator() {
  // Rates from pricing copy
  const MARKETING_RATE = 0.001; // $ per marketing email
  const TRANSACTIONAL_RATE = 0.0004; // $ per transactional email
  const MINIMUM_SPEND = 10; // $ minimum monthly spend

  // Defaults chosen to total $10: 8000*$0.001 + 5000*$0.0004 = 10
  const [marketing, setMarketing] = React.useState<number>(5000);
  const [transactional, setTransactional] = React.useState<number>(12500);

  const marketingCost = marketing * MARKETING_RATE;
  const transactionalCost = transactional * TRANSACTIONAL_RATE;
  const subtotal = marketingCost + transactionalCost;
  const totalDue = Math.max(subtotal, MINIMUM_SPEND);

  return (
    <div className="rounded-[18px] bg-primary/20 p-1">
      <div className="rounded-[14px] bg-primary/20 p-0.5 shadow-sm">
        <div className="bg-background rounded-xl p-5 pb-10">
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <div className="text-sm uppercase tracking-wider text-primary">
                Pricing Calculator
              </div>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                Drag the sliders to estimate your monthly cost.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <Slider
                label="Marketing emails / month"
                value={marketing}
                onChange={setMarketing}
                min={0}
                max={3000000}
                step={500}
                suffix="emails"
              />
              <Slider
                label="Transactional emails / month"
                value={transactional}
                onChange={setTransactional}
                min={0}
                max={3000000}
                step={500}
                suffix="emails"
              />
            </div>

            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
              <div className="rounded-lg border border-primary/30 p-4">
                <div className="text-xs text-muted-foreground">Marketing</div>
                <div className="text-lg font-medium">
                  ${marketingCost.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  @ ${MARKETING_RATE.toFixed(4)} each
                </div>
              </div>
              <div className="rounded-lg border border-primary/30 p-4">
                <div className="text-xs text-muted-foreground">
                  Transactional
                </div>
                <div className="text-lg font-medium">
                  ${transactionalCost.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  @ ${TRANSACTIONAL_RATE.toFixed(4)} each
                </div>
              </div>
              <div className="rounded-lg border border-primary/30 p-4 bg-primary/10">
                <div className="text-xs text-muted-foreground">
                  Estimated Total
                </div>
                <div className="text-3xl text-primary font-semibold">
                  ${totalDue.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {subtotal < MINIMUM_SPEND
                    ? "Minimum $10 applies"
                    : "before taxes"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PricingCalculator;
