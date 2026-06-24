export default function AuthSubmitButton({
  loading,
  children,
}: {
  loading: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: 'var(--accent-gradient, linear-gradient(135deg,#06b6d4,#8b5cf6))', color: '#fff' }}
    >
      {children}
    </button>
  );
}
