import type { GalleryFilter, GalleryPage } from '@/types/gallery';

export interface IGalleryRepository {
  findPublished(
    filter: GalleryFilter,
    options: { page: number; pageSize: number; currentUserId?: string }
  ): Promise<GalleryPage>;

  toggleLike(
    projectId: string,
    userId: string
  ): Promise<{ liked: boolean; newCount: number }>;

  forkProject(
    projectId: string,
    newOwnerId: string
  ): Promise<{ newProjectId: string; newSlug: string }>;
}
