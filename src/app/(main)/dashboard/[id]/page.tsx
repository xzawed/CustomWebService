import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ProjectService } from '@/services/projectService';
import { CatalogService } from '@/services/catalogService';
import { CodeRepository } from '@/repositories/codeRepository';
import { redirect, notFound } from 'next/navigation';
import type { ProjectStatus } from '@/types/project';
import { ProjectPublishActions } from '@/components/dashboard/ProjectPublishActions';

export const dynamic = 'force-dynamic';

const statusConfig: Record<ProjectStatus, { label: string; className: string }> = {
  draft: { label: '초안', className: 'bg-gray-100 text-gray-700' },
  generating: { label: '생성 중', className: 'bg-yellow-100 text-yellow-700' },
  generated: { label: '생성 완료', className: 'bg-blue-100 text-blue-700' },
  deploying: { label: '배포 중', className: 'bg-purple-100 text-purple-700' },
  deployed: { label: '배포됨', className: 'bg-green-100 text-green-700' },
  published: { label: '게시됨', className: 'bg-emerald-100 text-emerald-700' },
  unpublished: { label: '게시 취소', className: 'bg-gray-100 text-gray-500' },
  failed: { label: '실패', className: 'bg-red-100 text-red-700' },
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const projectService = new ProjectService(supabase);
  let project;
  try {
    project = await projectService.getById(id, user.id);
  } catch {
    notFound();
  }

  // Load APIs and latest code
  const apiIds = await projectService.getProjectApiIds(id);
  const catalogService = new CatalogService(supabase);
  const apis = await catalogService.getByIds(apiIds);
  const codeRepo = new CodeRepository(supabase);
  const latestCode = await codeRepo.findByProject(id);

  const status = statusConfig[project.status];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Link href="/dashboard" style={{ color: 'var(--text-muted)' }} className="hover:underline">
          대시보드
        </Link>
        <span className="mx-2">/</span>
        <span style={{ color: 'var(--text-primary)' }}>{project.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{project.name}</h1>
          <span
            className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${status.className}`}
          >
            {status.label}
          </span>
        </div>
        {project.deployUrl && (
          <a
            href={project.deployUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-sm"
          >
            서비스 열기
          </a>
        )}
      </div>

      {/* Context */}
      <section className="mb-8 rounded-xl p-6" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>서비스 설명</h2>
        <p className="whitespace-pre-wrap text-sm" style={{ color: 'var(--text-secondary)' }}>{project.context}</p>
      </section>

      {/* Selected APIs */}
      <section className="mb-8 rounded-xl p-6" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>사용된 API ({apis.length}개)</h2>
        <div className="flex flex-wrap gap-2">
          {apis.map((api) => (
            <span
              key={api.id}
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{ background: 'var(--accent-light)', color: 'var(--accent-primary)' }}
            >
              {api.name}
            </span>
          ))}
        </div>
      </section>

      {/* Generated Code Info */}
      {latestCode && (
        <section className="mb-8 rounded-xl p-6" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>생성 정보</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>버전</dt>
              <dd className="font-medium" style={{ color: 'var(--text-primary)' }}>v{latestCode.version}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>AI 모델</dt>
              <dd className="font-medium" style={{ color: 'var(--text-primary)' }}>{latestCode.aiModel ?? '-'}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>생성 소요 시간</dt>
              <dd className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {latestCode.generationTimeMs
                  ? `${(latestCode.generationTimeMs / 1000).toFixed(1)}초`
                  : '-'}
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>생성일</dt>
              <dd className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {new Date(latestCode.createdAt).toLocaleDateString('ko-KR')}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* Publish */}
      {(project.status === 'generated' ||
        project.status === 'deployed' ||
        project.status === 'published' ||
        project.status === 'unpublished') && (
        <section className="mb-8">
          <ProjectPublishActions project={project} />
        </section>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Link
          href="/builder"
          className="btn-secondary text-sm"
        >
          새 서비스 만들기
        </Link>
        {latestCode && (
          <Link
            href={`/preview/${id}`}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{ background: 'var(--accent-light)', color: 'var(--accent-primary)' }}
          >
            미리보기
          </Link>
        )}
      </div>
    </div>
  );
}
