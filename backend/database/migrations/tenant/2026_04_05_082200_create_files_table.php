<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('files', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('storage_path');
            $table->integer('base_64_data')->nullable(); // Wait, text is better for base64
            $table->text('base64_data')->nullable();
            $table->string('original_filename');
            $table->string('content_type');
            $table->bigInteger('size');
            $table->string('uploaded_by')->nullable();

            $table->boolean('is_deleted')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('files');
    }
};
