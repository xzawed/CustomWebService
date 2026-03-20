import { createClient } from '@/lib/supabase/server';
import { ProjectService } from '@/services/projectService';
import { CodeRepository } from '@/repositories/codeRepository';
import { assembleHtml } from '@/lib/ai/codeParser';
import { redirect, notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const projectService = new ProjectService(supabase);
  try {
    await projectService.getById(id, user.id);
  } catch {
    notFound();
  }

  const codeRepo = new CodeRepository(supabase);
  const code = await codeRepo.findByProject(id);

  if (!code) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">
            생성된 코드가 없습니다
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            먼저 빌더에서 코드를 생성해주세요.
          </p>
        </div>
      </div>
    );
  }

  const assembledHtml = assembleHtml({
    html: code.codeHtml,
    css: code.codeCss,
    js: code.codeJs,
  });

  const encodedHtml = `data:text/html;charset=utf-8,${encodeURIComponent(assembledHtml)}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">미리보기 (v{code.version})</h1>
        <div className="flex gap-2">
          <a
            href={`/dashboard/${id}`}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            프로젝트로 돌아가기
          </a>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <iframe
          src={encodedHtml}
          title="서비스 미리보기"
          className="h-[80vh] w-full"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>

      {code.metadata?.validationErrors && code.metadata.validationErrors.length > 0 && (
        <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <h3 className="text-sm font-medium text-yellow-800">검증 경고</h3>
          <ul className="mt-2 list-inside list-disc text-xs text-yellow-700">
            {code.metadata.validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
