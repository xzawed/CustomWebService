import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { CatalogService } from '@/services/catalogService';
import { createCatalogRepository } from '@/repositories/factory';
import { CatalogView } from '@/components/catalog/CatalogView';

export const metadata: Metadata = {
  title: 'API 카탈로그 | CustomWebService',
  description: '다양한 공공 및 민간 API를 탐색하고 웹서비스를 만들어보세요.',
};

export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  const supabase = await createClient();
  const catalogService = new CatalogService(createCatalogRepository(supabase));

  const [categoriesResult, apisResult] = await Promise.all([
    catalogService.getCategories(),
    catalogService.search({ limit: 100 }),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>API 카탈로그</h1>
        <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>30+ 무료 API를 탐색하세요</p>
      </div>

      <CatalogView initialApis={apisResult.items} categories={categoriesResult} />
    </div>
  );
}
