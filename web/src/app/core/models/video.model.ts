export interface Video {
  id: number;
  youtube_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  view_count: number | null;
  is_featured: boolean;
}
