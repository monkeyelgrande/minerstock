import { Category } from './category.model';

export interface Review {
  id: number;
  slug: string;
  title: string;
  brand: string | null;
  model: string | null;
  rating: number | null;
  summary: string | null;
  body?: string | null;
  pros: string[] | null;
  cons: string[] | null;
  hero_image: string | null;
  gallery?: string[] | null;
  youtube_video_id: string | null;
  is_featured: boolean;
  published_at: string | null;
  category?: Category;
}

export interface Paginated<T> {
  data: T[];
  links: { first: string; last: string; prev: string | null; next: string | null };
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}
