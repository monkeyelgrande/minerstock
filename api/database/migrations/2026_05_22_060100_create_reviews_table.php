<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->constrained()->cascadeOnDelete();
            $table->string('slug')->unique();
            $table->string('title');
            $table->string('brand')->nullable();
            $table->string('model')->nullable();
            $table->decimal('rating', 3, 1)->nullable(); // 0.0 – 10.0
            $table->text('summary')->nullable();
            $table->longText('body')->nullable();        // markdown
            $table->json('pros')->nullable();            // ["bateria buena", ...]
            $table->json('cons')->nullable();
            $table->string('hero_image')->nullable();    // path en storage
            $table->json('gallery')->nullable();         // array de paths
            $table->string('youtube_video_id')->nullable(); // YT id si hay video del review
            $table->timestamp('published_at')->nullable();
            $table->boolean('is_featured')->default(false);
            $table->timestamps();

            $table->index('published_at');
            $table->index('is_featured');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reviews');
    }
};
