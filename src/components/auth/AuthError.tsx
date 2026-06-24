export default function AuthError({ message }: { message: string | null }): React.ReactElement | null {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-400">
      {message}
    </div>
  );
}
