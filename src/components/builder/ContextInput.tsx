'use client';

import { LIMITS } from '@/lib/config/features';

interface ContextInputProps {
  value: string;
  onChange: (value: string) => void;
  minLength?: number;
  maxLength?: number;
}

export default function ContextInput({
  value,
  onChange,
  minLength = LIMITS.contextMinLength,
  maxLength = LIMITS.contextMaxLength,
}: ContextInputProps) {
  const charCount = value.length;
  const colorClass =
    charCount < minLength
      ? 'text-red-500'
      : charCount > maxLength - 200
        ? 'text-yellow-500'
        : 'text-green-600';

  return (
    <div>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="만들고 싶은 서비스를 자유롭게 설명해주세요..."
          rows={8}
          className="w-full resize-none rounded-lg p-4 text-sm focus:outline-none focus:ring-1"
          style={{
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            caretColor: 'var(--accent-primary)',
          }}
        />
        <div className="absolute bottom-3 right-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className={colorClass}>{charCount}</span>/{maxLength}
        </div>
      </div>
      {charCount > 0 && charCount < minLength && (
        <p className="mt-1 text-xs text-red-500">
          최소 {minLength}자 이상 입력해주세요. (현재 {charCount}자)
        </p>
      )}
    </div>
  );
}
