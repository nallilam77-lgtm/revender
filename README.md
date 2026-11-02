# LevelUp Recargas

Panel para revendedores de recargas de **Free Fire**: recargas individuales y masivas, saldo pagado por Binance Pay, lista de precios, clientes, niveles con descuentos, API y soporte.

## Estado
Prototipo de interfaz. Los datos son simulados y se guardan en el navegador (`localStorage`).

## Estructura
| Archivo | Contenido |
|---|---|
| `index.html` | Estructura (login + panel) |
| `styles.css` | Diseño |
| `app.js` | Lógica, vistas y datos de ejemplo |

## Ejecutar en local
Abre `index.html` en el navegador. Usuario de demostración: `demo@levelup.store` / `demo1234`.

## Cómo se agrega saldo
1. El revendedor envía USDT por **Binance Pay** al Pay ID de la tienda.
2. Registra el depósito en el panel con el **ID de orden de Binance** (queda *en revisión*).
3. Envía la captura por **WhatsApp** con el mensaje generado por el panel.
4. El administrador lo aprueba (o rechaza) y el saldo se acredita.

## Backend (Supabase)
`supabase/migrations/` contiene el esquema, la seguridad por filas (RLS) y las funciones del servidor.
El saldo solo cambia mediante funciones (`place_order`, `admin_approve_deposit`, `admin_update_order`, `admin_adjust_balance`).

## Próximos pasos
- [x] Esquema de base de datos y seguridad
- [ ] Aplicar en Supabase y configurar Binance Pay ID / WhatsApp
- [ ] Conectar el panel a Supabase (login y datos reales)
- [ ] Panel de administrador
- [ ] Integración con proveedor de recargas
- [ ] Despliegue en Vercel
