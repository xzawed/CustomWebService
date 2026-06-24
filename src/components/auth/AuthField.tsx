interface AuthFieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  hint?: string;
}

export default function AuthField({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  hint,
}: AuthFieldProps): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        value={value}
        onChange={onChange}
        className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-cyan-500/40"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
      />
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
