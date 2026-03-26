import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--bg-base)' }}>
      <Header />
      <main className="flex-1 pt-4">{children}</main>
      <Footer />
    </div>
  );
}
