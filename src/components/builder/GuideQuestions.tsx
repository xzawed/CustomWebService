'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const QUESTIONS = [
  '이 서비스의 주요 사용자는 누구인가요?',
  '어떤 문제를 해결하려고 하나요?',
  '핵심 기능 3가지를 설명해주세요.',
  'UI/UX 스타일은 어떤 느낌이면 좋을까요?',
  '데이터를 어떤 방식으로 표시하고 싶나요? (차트, 표, 카드 등)',
];

interface GuideQuestionsProps {
  onInsert: (text: string) => void;
}

export default function GuideQuestions({ onInsert }: GuideQuestionsProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-sm font-medium transition-colors"
        style={{ color: 'var(--text-secondary)' }}
      >
        가이드 질문을 참고하세요
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {isOpen && (
        <ul className="space-y-1">
          {QUESTIONS.map((q) => (
            <li key={q} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span className="mt-0.5" style={{ color: 'var(--accent-primary)' }}>•</span>
              <button
                type="button"
                onClick={() => onInsert(`\n${q}\n`)}
                className="text-left transition-colors hover:underline"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
