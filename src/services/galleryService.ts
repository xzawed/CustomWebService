import type { IGalleryRepository } from '@/repositories/interfaces';
import type { GalleryFilter, GalleryPage } from '@/types/gallery';

export class GalleryService {
  constructor(private repo: IGalleryRepository) {}

  async getGallery(
    filter: GalleryFilter,
    options: { page: number; pageSize: number; currentUserId?: string }
  ): Promise<GalleryPage> {
    return this.repo.findPublished(filter, options);
  }

  async likeProject(
    projectId: string,
    userId: string
  ): Promise<{ liked: boolean; likesCount: number }> {
    const result = await this.repo.toggleLike(projectId, userId);
    // Ensure liked=true (if toggle produced unlike, toggle again)
    if (!result.liked) {
      const retry = await this.repo.toggleLike(projectId, userId);
      return { liked: retry.liked, likesCount: retry.newCount };
    }
    return { liked: result.liked, likesCount: result.newCount };
  }

  async unlikeProject(
    projectId: string,
    userId: string
  ): Promise<{ liked: boolean; likesCount: number }> {
    const result = await this.repo.toggleLike(projectId, userId);
    // Ensure liked=false (if toggle produced like, toggle again)
    if (result.liked) {
      const retry = await this.repo.toggleLike(projectId, userId);
      return { liked: retry.liked, likesCount: retry.newCount };
    }
    return { liked: result.liked, likesCount: result.newCount };
  }

  async forkProject(
    projectId: string,
    userId: string
  ): Promise<{ projectId: string; slug: string }> {
    const result = await this.repo.forkProject(projectId, userId);
    return { projectId: result.newProjectId, slug: result.newSlug };
  }
}
