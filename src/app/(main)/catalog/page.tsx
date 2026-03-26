import { createClient } from '@/lib/supabase/server';
import { CatalogService } from '@/services/catalogService';
import { CatalogView } from '@/components/catalog/CatalogView';

export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  const supabase = await createClient();
  const catalogService = new CatalogService(supabase);

  const [categoriesResult, apisResult] = await Promise.all([
    catalogService.getCategories(),
    catalogService.search({ limit: 100 }),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">API 카탈로그</h1>
        <p className="mt-2 text-gray-600">30+ 무료 API를 탐색하세요</p>
      </div>

      <CatalogView initialApis={apisResult.items} categories={categoriesResult} />
    </div>
  );
}
