'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Project } from '@/types/project';
import { ProjectCard } from './ProjectCard';
import { usePublish } from '@/hooks/usePublish';

interface ProjectGridProps {
  projects: Project[];
}

export function ProjectGrid({ projects: initialProjects }: ProjectGridProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const { publish, unpublish } = usePublish();

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/v1/projects/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setProjects((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const handlePublish = async (id: string) => {
    try {
      const { data } = await publish(id);
      setProjects((prev) => prev.map((p) => (p.id === id ? data : p)));
    } catch {
      // 에러는 usePublish에서 처리
    }
  };

  const handleUnpublish = async (id: string) => {
    try {
      const { data } = await unpublish(id);
      setProjects((prev) => prev.map((p) => (p.id === id ? data : p)));
    } catch {
      // 에러는 usePublish에서 처리
    }
  };

  if (projects.length === 0) {
    return (
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
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onDelete={handleDelete}
          onPublish={handlePublish}
          onUnpublish={handleUnpublish}
        />
      ))}
    </div>
  );
}
