export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  reviews_count?: number;
}
