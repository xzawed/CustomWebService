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
          // 미상이면 표시값을 건드리지 않는다 — 헤더의 "현재 v{N}" 은 사람이 읽는 라벨이라
          // 빈 값이나 잘못된 숫자를 보이느니 직전 값을 유지하는 편이 낫다.
          // (`router.refresh()` 가 서버에서 실제 최신값을 다시 가져온다.)
          if (version !== undefined) setLatestVersion(version);
          router.refresh();
        }}
      />
    </div>
  );
}
