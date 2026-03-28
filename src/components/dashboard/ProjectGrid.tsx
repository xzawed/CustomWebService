'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Project } from '@/types/project';
import { ProjectCard } from './ProjectCard';
import { usePublish } from '@/hooks/usePublish';
import { Hammer, Plus } from 'lucide-react';

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
      <div
        className="flex flex-col items-center justify-center rounded-2xl py-24"
        style={{ background: 'var(--bg-surface)', border: '1px dashed var(--glass-border)' }}
      >
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: 'var(--grad-subtle)' }}
        >
          <Hammer className="h-7 w-7" style={{ color: 'var(--accent-primary)' }} />
        </div>
        <h2 className="mt-5 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>아직 만든 서비스가 없어요</h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          API를 골라 담고 나만의 웹서비스를 만들어보세요
        </p>
        <Link href="/builder" className="btn-primary mt-8 inline-flex items-center gap-2">
          <Plus className="h-4 w-4" />
          서비스 만들기
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
