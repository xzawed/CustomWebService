import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { GalleryService } from '@/services/galleryService';
import type { GalleryPage } from '@/types/gallery';
import { GalleryClient } from './GalleryClient';

export const metadata: Metadata = {
  title: '서비스 갤러리 | CustomWebService',
  description: 'AI로 만든 다양한 웹서비스를 탐색하고 포크하세요.',
};

export const dynamic = 'force-dynamic';

export default async function GalleryPage(): Promise<React.ReactElement> {
  const supabase = await createClient();

  // Auth is optional — unauthenticated users can browse the gallery
  let currentUserId: string | undefined;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    currentUserId = user?.id;
  } catch {
    // Not authenticated — continue without user context
  }

  const service = new GalleryService(supabase);
  let initialData: GalleryPage = { items: [], total: 0, page: 1, pageSize: 12 };

  try {
    const result = await service.getGallery(
      { sortBy: 'newest' },
      { page: 1, pageSize: 12, currentUserId }
    );
    initialData = result;
  } catch (error) {
    console.warn(
      'Failed to load gallery:',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
          서비스 갤러리
        </h1>
        <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
          AI로 만든 다양한 웹서비스를 탐색하고 포크해보세요
        </p>
      </div>

      {/* Client interactive section */}
      <GalleryClient initialData={initialData} currentUserId={currentUserId} />
    </div>
  );
}
