# MinerStock — Sistema de diseño (desde Stitch)

> Fuente: proyecto Stitch `8955264986145320867` ("Industrial Precision Mining ERP"). Este archivo es la referencia de tokens para el frontend Angular. Estilo: **Modern Industrial Utility**, denso, desktop-first.

## Colores

### Identidad y estructura
| Token | Valor | Uso |
|---|---|---|
| primary (ámbar minero) | `#F59E0B` | botones primarios, ítem activo, foco. Hover `#D97706`, activo `#B45309` |
| shell oscuro | `#0F172A` | sidebar y encabezados del sistema |
| shell secundario | `#1E293B` | sub-paneles, fila de navegación activa, divisores |
| texto sobre shell | `#F8FAFC` activo / `#94A3B8` secundario | |
| tertiary (azul) | `#3B82F6` | enlaces de documentos (OC-00231), acciones de enlace |

### Lienzo y superficies
| Token | Valor |
|---|---|
| fondo app | `#F5F6F8` |
| superficie (tarjetas, formularios, tablas) | `#FFFFFF` |
| borde suave | `#E5E7EB` |
| borde de formularios / contenedores | `#D1D5DB` |
| texto principal | `#1F2937` |
| texto secundario / encabezados de columna | `#4B5563` |
| placeholder | `#9CA3AF` |

### Estados (chips)
| Estado | Texto | Fondo | Borde |
|---|---|---|---|
| Borrador / inactivo | `#475569` | `#F1F5F9` | `#CBD5E1` |
| Pendiente / enviada / despachada | `#1D4ED8` | `#EFF6FF` | `#BFDBFE` |
| Aprobada / confirmada / recibida | `#065F46` | `#ECFDF5` | `#A7F3D0` |
| Parcial / en tránsito | `#C2410C` | `#FFF7ED` | `#FED7AA` |
| Rechazada / anulada / vencida | `#B91C1C` | `#FEF2F2` | `#FECACA` |

## Tipografía (Inter)
| Token | Tamaño / peso / interlineado |
|---|---|
| headline-xl | 28px / 700 / 36px, tracking -0.02em |
| headline-lg (título de página) | 24px / 600 / 32px |
| headline-md | 20px / 600 / 28px |
| headline-sm (título de tarjeta) | 16px / 600 / 24px |
| body-lg | 16px / 400 / 24px |
| body-md (cuerpo) | 14px / 400 / 20px |
| body-sm | 13px / 400 / 18px |
| label-lg / md / sm | 14 / 13 / 12px, peso 500 |
| table-header | 11px / 600 / 16px, mayúsculas, tracking 0.05em |
| mono-data (números) | 13px / 500, `tabular-nums` |

Todos los números (cantidades, montos, SKU) usan `tabular-nums` y se alinean a la derecha en tablas.

## Espaciado y medidas
- space: 2xs 2px · xs 4px · sm 8px · md 12px · lg 16px · xl 24px · 2xl 32px
- sidebar 260px (colapsada 68px); topbar 64px
- inputs 40px de alto (32px versión densa); filas de tabla 44px (36px densas)
- márgenes de área de trabajo 24px; gutters 16px
- radios: componentes 8px; chips 6px; badges numéricos pill

## Elevación
- Nivel 0 fondo plano `#F5F6F8`
- Nivel 1 tarjetas: borde `#E5E7EB` + sombra `0 1px 2px rgba(15,23,42,.05)`
- Nivel 2 hover: borde `#D1D5DB` + `0 4px 6px -1px rgba(15,23,42,.08)`
- Nivel 3 menús/popovers: `0 10px 15px -3px rgba(15,23,42,.10)`
- Nivel 4 modales: telón `rgba(15,23,42,.65)` + `0 20px 25px -5px rgba(15,23,42,.15)`

## Componentes
- **Botón primario**: 40px, padding 0 16px, fondo ámbar, texto `#1F2937` semibold 14px, radio 8px.
- **Botón secundario**: blanco, borde `#D1D5DB`, texto `#1F2937`; hover fondo `#F9FAFB`.
- **Botón destructivo**: fondo `#EF4444`, texto blanco.
- **Botón de tabla**: 32px, 13px.
- **Inputs**: 40px, radio 8px, borde `#D1D5DB`, foco borde ámbar + anillo `rgba(245,158,11,.25)`; error borde `#EF4444`.
- **Chips de estado**: 24px, padding 2px 8px, 12px semibold, radio 6px.
- **Tablas**: encabezado 36px fondo `#F8FAFC`, borde inferior `#CBD5E1`, texto `#64748B` 11px mayúsculas; filas con hover `#F8FAFC` y borde `#E5E7EB`.
- **Tarjetas**: padding 20px, borde `#E5E7EB`, radio 8px, título 16px semibold separado por línea `#F3F4F6`.

## Iconografía
Las pantallas generadas usan **Material Symbols Outlined** (20px en navegación, 18px en tablas). Se cargan desde Google Fonts.

## Estructura del shell (según pantallas generadas)
- Sidebar fija: logo (icono `hardware` en ámbar + "MinerStock" + "ERP Minero Integrado"), secciones con encabezado en mayúsculas (Compras, Inventario, Cuentas por pagar, Logística, Bodega, Gestión), ítem activo con borde izquierdo ámbar de 4px y fondo `#1E293B`; pie con avatar, nombre y rol del usuario.
- Topbar fija: buscador global con atajo `Ctrl+K`, selector de bodega activa (icono `warehouse`, etiqueta "Bodega activa" + nombre), campana con contador, avatar con menú.
- Contenido: breadcrumb pequeño, título `headline-lg`, subtítulo, botones a la derecha; luego tarjetas.
