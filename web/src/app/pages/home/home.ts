import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ApiService } from '../../core/services/api.service';
import { Category } from '../../core/models/category.model';
import { Review } from '../../core/models/review.model';
import { Video } from '../../core/models/video.model';
import { HealthResponse } from '../../core/models/health.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomeComponent implements OnInit {
  private api = inject(ApiService);

  health = signal<HealthResponse | null>(null);
  healthError = signal<string | null>(null);

  categories = signal<Category[]>([]);
  featuredReviews = signal<Review[]>([]);
  featuredVideos = signal<Video[]>([]);

  loading = signal(true);

  ngOnInit(): void {
    this.api.health().subscribe({
      next: (r) => this.health.set(r),
      error: (err) => this.healthError.set(err?.message ?? 'API no responde'),
    });

    this.api.categories().subscribe({
      next: (r) => this.categories.set(r.data),
    });

    this.api.reviews({ featured: true, perPage: 6 }).subscribe({
      next: (r) => this.featuredReviews.set(r.data),
      complete: () => this.loading.set(false),
    });

    this.api.videos({ featured: true, limit: 6 }).subscribe({
      next: (r) => this.featuredVideos.set(r.data),
    });
  }
}
