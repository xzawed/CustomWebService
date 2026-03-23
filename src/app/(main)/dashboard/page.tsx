import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ProjectService } from '@/services/projectService';
import { redirect } from 'next/navigation';
import { ProjectGrid } from '@/components/dashboard/ProjectGrid';
import type { Project } from '@/types/project';

export const dynamic = 'force-dynamic';

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

      <ProjectGrid projects={projects} />
    </div>
  );
}
