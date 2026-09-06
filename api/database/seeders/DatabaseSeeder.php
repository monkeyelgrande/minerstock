<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Review;
use App\Models\User;
use App\Models\Video;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Admin user (para tokens Sanctum)
        User::updateOrCreate(
            ['email' => 'admin@monkeystechnology.com'],
            [
                'name' => 'Admin Monkeys Technology',
                'password' => Hash::make('changeme'),
            ]
        );

        // Categorías base
        $categories = [
            ['slug' => 'laptops', 'name' => 'Laptops', 'sort_order' => 10],
            ['slug' => 'perifericos', 'name' => 'Periféricos', 'sort_order' => 20],
            ['slug' => 'moviles', 'name' => 'Móviles', 'sort_order' => 30],
            ['slug' => 'redes', 'name' => 'Redes', 'sort_order' => 40],
            ['slug' => 'software', 'name' => 'Software', 'sort_order' => 50],
        ];
        foreach ($categories as $c) {
            Category::updateOrCreate(['slug' => $c['slug']], $c);
        }

        // Un review demo (para verificar que el endpoint funciona end-to-end)
        $cat = Category::where('slug', 'laptops')->first();
        Review::updateOrCreate(
            ['slug' => 'lenovo-thinkpad-t14-gen5-review'],
            [
                'category_id' => $cat->id,
                'title' => 'Lenovo ThinkPad T14 Gen 5 — vale la pena en 2026?',
                'brand' => 'Lenovo',
                'model' => 'ThinkPad T14 Gen 5',
                'rating' => 8.5,
                'summary' => 'Workstation portátil sólida, teclado top, pero precio agresivo frente a la competencia.',
                'body' => "# Primer impresión\n\nLa T14 sigue siendo la T14...",
                'pros' => ['Teclado increíble', 'Construcción mil-spec', 'Soporte Linux pleno'],
                'cons' => ['Pantalla podría ser más brillante', 'Precio'],
                'hero_image' => null,
                'gallery' => [],
                'youtube_video_id' => null,
                'is_featured' => true,
                'published_at' => Carbon::now()->subDays(3),
            ]
        );

        // Un video demo (placeholder — luego se llenará vía sync de YouTube API)
        Video::updateOrCreate(
            ['youtube_id' => 'dQw4w9WgXcQ'],
            [
                'title' => 'Bienvenidos al canal @monkeystechnology',
                'description' => 'Video destacado del canal.',
                'thumbnail_url' => 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
                'published_at' => Carbon::now()->subDays(7),
                'view_count' => 1234,
                'is_featured' => true,
                'sort_order' => 1,
                'last_synced_at' => Carbon::now(),
            ]
        );
    }
}
