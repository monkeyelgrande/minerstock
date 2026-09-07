<?php

namespace App\Services\Purchasing;

use App\Exceptions\DomainException;
use App\Models\Product;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection as BaseCollection;

/**
 * Utilidades comunes para ítems de documentos: conversión de unidades y sincronización
 * de líneas (crear / actualizar / eliminar según el payload).
 */
class LineItems
{
    /**
     * Devuelve el factor de conversión del producto para la unidad dada.
     *
     * @throws DomainException si la unidad no es la base ni una alterna del producto
     */
    public static function factorFor(Product $product, int $unitId): float
    {
        $product->loadMissing('units');
        $factor = $product->factorFor($unitId);
        if ($factor === null) {
            throw new DomainException("La unidad seleccionada no está configurada para el producto {$product->sku}.");
        }

        return $factor;
    }

    /**
     * Sincroniza las líneas de un documento con el payload.
     * Cada línea del payload puede traer `id` (actualizar) o no (crear). Las líneas
     * existentes que no vengan en el payload se eliminan.
     *
     * @param  HasMany  $relation  relación items() del documento
     * @param  array<int, array<string, mixed>>  $lines  payload validado
     * @param  callable(array, int): array  $mapLine  transforma una línea del payload en atributos del modelo
     * @return Collection líneas resultantes
     */
    public static function sync(HasMany $relation, array $lines, callable $mapLine): Collection
    {
        /** @var Collection $existing */
        $existing = $relation->get()->keyBy('id');
        $keep = [];

        foreach (array_values($lines) as $index => $line) {
            $attrs = $mapLine($line, $index) + ['sort_order' => $index];
            $id = isset($line['id']) ? (int) $line['id'] : null;

            if ($id && $existing->has($id)) {
                $model = $existing->get($id);
                $model->fill($attrs)->save();
            } else {
                $model = $relation->create($attrs);
            }
            $keep[] = $model->id;
        }

        $relation->whereNotIn('id', $keep)->delete();

        return $relation->get();
    }

    /** Products indexados por id para un conjunto de líneas (una sola consulta). */
    public static function productsFor(array $lines): BaseCollection
    {
        $ids = collect($lines)->pluck('product_id')->unique()->values();

        return Product::query()->with('units')->whereIn('id', $ids)->get()->keyBy('id');
    }
}
