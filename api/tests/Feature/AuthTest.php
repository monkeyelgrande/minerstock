<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_login_returns_token_and_user_with_permissions(): void
    {
        $res = $this->postJson('/api/auth/login', [
            'login' => 'admin',
            'password' => 'changeme',
        ]);

        $res->assertOk()
            ->assertJsonStructure(['token', 'user' => ['id', 'name', 'roles', 'permissions', 'warehouses']])
            ->assertJsonPath('user.roles.0', 'admin');

        $this->assertContains('products.create', $res->json('user.permissions'));
    }

    public function test_login_rejects_bad_credentials(): void
    {
        $this->postJson('/api/auth/login', ['login' => 'admin', 'password' => 'nope'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['login']);
    }

    public function test_inactive_user_cannot_login(): void
    {
        $user = User::factory()->create(['is_active' => false, 'password' => 'secret123']);

        $this->postJson('/api/auth/login', ['login' => $user->email, 'password' => 'secret123'])
            ->assertStatus(422)
            ->assertJsonPath('errors.login.0', 'El usuario está inactivo. Contacta al administrador.');
    }

    public function test_protected_routes_return_401_without_token(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401);
        $this->getJson('/api/catalog/products')->assertStatus(401);
    }

    public function test_logout_revokes_token(): void
    {
        $token = $this->postJson('/api/auth/login', [
            'login' => 'admin',
            'password' => 'changeme',
        ])->json('token');

        $this->withToken($token)->postJson('/api/auth/logout')->assertNoContent();

        // El guard cachea el usuario dentro del mismo proceso de pruebas; lo limpiamos.
        $this->app['auth']->forgetGuards();

        $this->withToken($token)->getJson('/api/auth/me')->assertStatus(401);
    }
}
