'use client';

interface StepIndicatorProps {
  currentStep: number;
  steps: { label: string }[];
}

export default function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
  return (
    <div className="mb-10">
      <div className="flex items-center justify-center gap-4">
        {steps.map(({ label }, idx) => {
          const num = idx + 1;
          return (
            <div key={num} className="flex items-center gap-4">
              {idx > 0 && (
                <div
                  className={`h-0.5 w-12 ${
                    currentStep > idx ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                    currentStep >= num
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {currentStep > num ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    num
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${
                    currentStep >= num ? 'text-gray-900' : 'text-gray-400'
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
