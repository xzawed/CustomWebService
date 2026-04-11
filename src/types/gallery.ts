export interface GalleryItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  likesCount: number;
  isLikedByCurrentUser: boolean;
  createdAt: string;
  ownerName: string | null; // from profiles join or null
}

export interface GalleryFilter {
  category?: string;
  sortBy?: 'newest' | 'popular';
  search?: string;
}

export interface GalleryPage {
  items: GalleryItem[];
  total: number;
  page: number;
  pageSize: number;
}
