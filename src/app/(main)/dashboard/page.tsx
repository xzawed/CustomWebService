import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ProjectService } from '@/services/projectService';
import { redirect } from 'next/navigation';
import type { Project, ProjectStatus } from '@/types/project';

export const dynamic = 'force-dynamic';

const statusConfig: Record<ProjectStatus, { label: string; className: string }> = {
  draft: { label: '초안', className: 'bg-gray-100 text-gray-700' },
  generating: { label: '생성 중', className: 'bg-yellow-100 text-yellow-700' },
  generated: { label: '생성 완료', className: 'bg-blue-100 text-blue-700' },
  deploying: { label: '배포 중', className: 'bg-purple-100 text-purple-700' },
  deployed: { label: '배포됨', className: 'bg-green-100 text-green-700' },
  failed: { label: '실패', className: 'bg-red-100 text-red-700' },
};

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const projectService = new ProjectService(supabase);
  let projects: Project[] = [];

  try {
    projects = await projectService.getByUserId(user.id);
  } catch (error) {
    console.warn(
      'Failed to load projects:',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">내 서비스</h1>
        <Link
          href="/builder"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          + 새 서비스 만들기
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 py-20">
          <div className="text-5xl">🛠️</div>
          <h2 className="mt-4 text-lg font-semibold text-gray-700">
            아직 만든 서비스가 없어요
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            API를 골라 담고 나만의 웹서비스를 만들어보세요.
          </p>
          <Link
            href="/builder"
            className="mt-6 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            서비스 만들러 가기
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const status = statusConfig[project.status];
            return (
              <div
                key={project.id}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <h3 className="truncate text-base font-semibold text-gray-900">
                    {project.name}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                </div>

                {project.deployUrl && isValidUrl(project.deployUrl) && (
                  <a
                    href={project.deployUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block truncate text-sm text-blue-600 hover:underline"
                  >
                    {project.deployUrl}
                  </a>
                )}

                <p className="mt-3 text-xs text-gray-400">
                  {formatDate(project.createdAt)} 생성
                </p>

                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/dashboard/${project.id}`}
                    className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                  >
                    상세 보기
                  </Link>
                  {project.previewUrl && (
                    <a
                      href={project.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    >
                      미리보기
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
