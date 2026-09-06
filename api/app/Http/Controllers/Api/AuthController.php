<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'login' => ['required', 'string', 'max:160'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:80'],
        ]);

        // Se puede entrar con el nombre de usuario o con el correo.
        $login = trim($data['login']);
        $user = User::query()
            ->where('username', $login)
            ->orWhere('email', $login)
            ->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'login' => ['Credenciales incorrectas.'],
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'login' => ['El usuario está inactivo. Contacta al administrador.'],
            ]);
        }

        $user->forceFill(['last_login_at' => now()])->saveQuietly();
        $token = $user->createToken($data['device_name'] ?? 'web')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => new UserResource($user->load(['roles', 'warehouses'])),
        ]);
    }

    public function me(Request $request): UserResource
    {
        return new UserResource($request->user()->load(['roles', 'warehouses']));
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(null, 204);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = $request->user();
        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['La contraseña actual no es correcta.'],
            ]);
        }

        $user->forceFill(['password' => $data['password']])->save();

        return response()->json(['message' => 'Contraseña actualizada.']);
    }

    public function updateProfile(Request $request): UserResource
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:40'],
            'default_warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
        ]);

        $user = $request->user();
        $user->fill($data)->save();

        return new UserResource($user->load(['roles', 'warehouses']));
    }
}
