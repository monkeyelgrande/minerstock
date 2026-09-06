import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Category } from '../models/category.model';
import { Review, Paginated } from '../models/review.model';
import { Video } from '../models/video.model';
import { HealthResponse } from '../models/health.model';

interface CollectionResponse<T> {
  data: T[];
}

interface ResourceResponse<T> {
  data: T;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  health(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.base}/health`);
  }

  categories(): Observable<CollectionResponse<Category>> {
    return this.http.get<CollectionResponse<Category>>(`${this.base}/categories`);
  }

  reviews(opts: { category?: string; featured?: boolean; perPage?: number } = {}): Observable<Paginated<Review>> {
    let params = new HttpParams();
    if (opts.category) params = params.set('category', opts.category);
    if (opts.featured) params = params.set('featured', '1');
    if (opts.perPage) params = params.set('per_page', String(opts.perPage));
    return this.http.get<Paginated<Review>>(`${this.base}/reviews`, { params });
  }

  review(slug: string): Observable<ResourceResponse<Review>> {
    return this.http.get<ResourceResponse<Review>>(`${this.base}/reviews/${slug}`);
  }

  videos(opts: { featured?: boolean; limit?: number } = {}): Observable<CollectionResponse<Video>> {
    let params = new HttpParams();
    if (opts.featured) params = params.set('featured', '1');
    if (opts.limit) params = params.set('limit', String(opts.limit));
    return this.http.get<CollectionResponse<Video>>(`${this.base}/videos`, { params });
  }
}
