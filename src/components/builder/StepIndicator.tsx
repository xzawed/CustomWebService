'use client';

import { Check } from 'lucide-react';

interface StepIndicatorProps {
  currentStep: number;
  steps: { label: string }[];
}

export default function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
  return (
    <div className="mb-10">
      <div className="flex items-center justify-center gap-3 sm:gap-4">
        {steps.map(({ label }, idx) => {
          const num = idx + 1;
          const isCompleted = currentStep > num;
          const isActive = currentStep === num;
          return (
            <div key={num} className="flex items-center gap-3 sm:gap-4">
              {idx > 0 && (
                <div
                  className={`h-px w-8 transition-colors sm:w-14 ${
                    isCompleted ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                />
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-all ${
                    isCompleted
                      ? 'bg-cyan-500 text-white'
                      : isActive
                        ? 'bg-gradient-to-br from-cyan-500/20 to-violet-500/20 text-cyan-400 ring-1 ring-cyan-500/30'
                        : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : num}
                </div>
                <span
                  className={`hidden text-xs font-semibold sm:block ${
                    isCompleted || isActive ? 'text-white' : 'text-slate-500'
                  }`}
                >
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
