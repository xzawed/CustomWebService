'use client';

import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import RePromptPanel from '@/components/builder/RePromptPanel';

interface RePromptSectionProps {
  projectId: string;
  currentVersion: number;
}

export function RePromptSection({ projectId, currentVersion }: RePromptSectionProps): React.JSX.Element {
  const router = useRouter();
  const [latestVersion, setLatestVersion] = useState(currentVersion);

  return (
    <div
      className="rounded-xl p-6"
      style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
    >
      <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
        피드백으로 수정하기 (현재 v{latestVersion})
      </h2>
      <RePromptPanel
        projectId={projectId}
        onRegenerationComplete={(version) => {
          setLatestVersion(version);
          router.refresh();
        }}
      />
    </div>
  );
}
