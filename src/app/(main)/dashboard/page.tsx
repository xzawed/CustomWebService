import type { Metadata } from 'next';
import Link from 'next/link';
import { getAuthUser } from '@/lib/auth/index';
import { getDbProvider } from '@/lib/config/providers';
import { createClient } from '@/lib/supabase/server';
import { createProjectService } from '@/services/factory';
import { redirect } from 'next/navigation';
import { ProjectGrid } from '@/components/dashboard/ProjectGrid';
import type { Project } from '@/types/project';

export const metadata: Metadata = {
  title: '내 프로젝트 | CustomWebService',
  description: '생성한 웹서비스 프로젝트를 관리하세요.',
};

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) {
    redirect('/login');
  }

  const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;
  const projectService = createProjectService(supabase);
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
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>내 서비스</h1>
        <Link
          href="/builder"
          className="btn-primary text-sm"
        >
          + 새 서비스 만들기
        </Link>
      </div>

      <ProjectGrid projects={projects} />
    </div>
  );
}
