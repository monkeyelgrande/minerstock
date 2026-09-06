<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Support\Facades\DB;

/**
 * CRUD base para maestros.
 *
 * Parámetros de listado soportados:
 *  - search   : texto libre sobre $searchable
 *  - active   : 1|0 filtra por is_active
 *  - sort/dir : columna y dirección (solo columnas en $sortable)
 *  - per_page : tamaño de página (máx. 100)
 *  - all      : 1 devuelve todo sin paginar (para selectores)
 */
abstract class CrudController extends Controller
{
    /** @var class-string<Model> */
    protected string $model;

    /** @var class-string<JsonResource> */
    protected string $resource = JsonResource::class;

    /** @var string[] columnas para búsqueda libre */
    protected array $searchable = ['name'];

    /** @var string[] relaciones a cargar */
    protected array $with = [];

    /** @var string[] columnas por las que se puede ordenar */
    protected array $sortable = ['id', 'name', 'created_at', 'updated_at'];

    protected string $defaultSort = 'name';

    protected string $defaultDir = 'asc';

    public function index(Request $request): ResourceCollection
    {
        $query = $this->model::query()->with($this->with);

        $this->applyFilters($query, $request);

        $search = trim((string) $request->query('search', ''));
        if ($search !== '' && $this->searchable) {
            $query->where(function (Builder $q) use ($search) {
                foreach ($this->searchable as $column) {
                    $q->orWhere($column, 'like', "%{$search}%");
                }
            });
        }

        // ConvertEmptyStringsToNull convierte `active=` en null: null y '' significan "sin filtro".
        $active = $request->query('active');
        if ($active !== null && $active !== '') {
            $query->where('is_active', filter_var($active, FILTER_VALIDATE_BOOLEAN));
        }

        $sort = (string) $request->query('sort', $this->defaultSort);
        $dir = strtolower((string) $request->query('dir', $this->defaultDir)) === 'desc' ? 'desc' : 'asc';
        if (in_array($sort, $this->sortable, true)) {
            $query->orderBy($sort, $dir);
        }

        if ($request->boolean('all')) {
            return $this->resource::collection($query->limit(2000)->get());
        }

        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return $this->resource::collection($query->paginate($perPage)->appends($request->query()));
    }

    public function show(int $id): JsonResource
    {
        $model = $this->model::query()->with($this->with)->findOrFail($id);

        return new $this->resource($model);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules($request, null));

        $model = DB::transaction(function () use ($data, $request) {
            $model = $this->model::query()->create($this->onlyModelAttributes($data));
            $this->afterSave($model, $data, $request);

            return $model;
        });

        return (new $this->resource($model->fresh($this->with)))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, int $id): JsonResource
    {
        $model = $this->model::query()->findOrFail($id);
        $data = $request->validate($this->rules($request, $model));

        DB::transaction(function () use ($model, $data, $request) {
            $model->fill($this->onlyModelAttributes($data))->save();
            $this->afterSave($model, $data, $request);
        });

        return new $this->resource($model->fresh($this->with));
    }

    public function destroy(int $id): JsonResponse
    {
        $model = $this->model::query()->findOrFail($id);

        try {
            $model->delete();
        } catch (QueryException $e) {
            if ((string) $e->getCode() === '23000') {
                return response()->json([
                    'message' => 'No se puede eliminar: el registro está en uso por otros documentos. Desactívalo en su lugar.',
                ], 409);
            }
            throw $e;
        }

        return response()->json(null, 204);
    }

    /** Reglas de validación. $model es null al crear. */
    abstract protected function rules(Request $request, ?Model $model): array;

    /** Filtros específicos del recurso (query params adicionales). */
    protected function applyFilters(Builder $query, Request $request): void {}

    /** Hook tras guardar (relaciones anidadas, sincronizaciones). */
    protected function afterSave(Model $model, array $data, Request $request): void {}

    /** Claves del payload que no son columnas del modelo (se manejan en afterSave). */
    protected array $nested = [];

    protected function onlyModelAttributes(array $data): array
    {
        return array_diff_key($data, array_flip($this->nested));
    }
}
