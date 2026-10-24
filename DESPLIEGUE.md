# Puesta en marcha – Salidas al baño (GBCS)

Primero se monta el entorno de **PRUEBAS** en la cuenta de Miguel Ángel (mgonruz857@g.educaand.es) con
alumnado ficticio. El del centro (14007180.aplicaciones@g.educaand.es) se monta igual, más adelante,
cuando se dé el visto bueno.

## 1. Crear la hoja de cálculo

1. Entrar en Google Drive con la cuenta (pruebas: la de Miguel Ángel).
2. Nuevo → Hojas de cálculo de Google. Llamarla `GBCS_PRUEBAS` (en el centro: `GBCS_IES_BLAS_INFANTE`).
3. **No compartirla con nadie.** El profesorado entra por la app; la hoja solo la ve su propietario.

## 2. Pegar el servidor

1. En la hoja: menú **Extensiones → Apps Script**.
2. Borrar todo lo que haya en `Código.gs` y pegar el contenido de [`servidor/Code.gs`](servidor/Code.gs).
3. Pulsar **Guardar** (icono del disquete).
4. En el desplegable de funciones de arriba elegir **`configurarHoja`** y pulsar **Ejecutar**.
   - Google pedirá permisos: "Revisar permisos" → elegir la cuenta → "Configuración avanzada" →
     "Ir a … (no seguro)" → **marcar todas las casillas** → Permitir.
   - Esto crea las pestañas `Profesorado`, `Alumnado`, `Historico_Salidas` y `Horario` y pone la hoja en hora de Madrid.

## 3. Rellenar profesorado y alumnado

En la hoja de cálculo:

- **Profesorado**: una fila por docente. `email` en minúsculas (@g.educaand.es), `full_name` como
  "Apellidos, Nombre" (así se reconoce en el PDF de horarios), `assigned_classroom_id` opcional
  (su tutoría) y `rol` = `DIRECTIVO` para el Equipo Directivo (vacío o `DOCENTE` para el resto).
- **Alumnado**: `student_id` (el mismo identificador que en convivencia), nombre, apellidos,
  `classroom_id` con los códigos de convivencia (`1ESO_A`, `2BACH_C`, `1_INF`…) e `is_active` = `TRUE`.
  En PRUEBAS, solo alumnado inventado.

Los cambios hechos a mano en estas pestañas se notan en la app al momento (la caché se borra sola al editar).

## 4. Publicar el servidor

1. En Apps Script: **Implementar → Nueva implementación**.
2. Tipo (rueda dentada): **Aplicación web**.
3. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier persona**.
   (Igual que convivencia: la seguridad la pone el programa, que no devuelve nada sin sesión, y así la hoja
   no hay que compartirla con el claustro.)
4. **Implementar** y copiar la **URL de la aplicación web** (termina en `/exec`).
5. Pasarle esa URL a Claude, que la pondrá en `src/config/entorno.ts`.

Cuando cambie `Code.gs`: pegar la versión nueva, guardar y en **Implementar → Gestionar implementaciones →
lápiz → Versión: Nueva versión → Implementar** (la URL no cambia).

## 5. Activar la web en GitHub Pages (una sola vez)

En GitHub, repositorio `salidas-bano-iesbi` → **Settings → Pages → Source: GitHub Actions**.
Cada cambio en la rama `main` se publica solo en https://mgonruz857-creator.github.io/salidas-bano-iesbi/

## 6. Primer acceso

1. Abrir la app, escribir el correo y elegir contraseña (dos veces). Primero un directivo.
2. En **Profesorado → Elegir PDF de horarios**, subir el PDF "Horarios de profesores" de Séneca, revisar que
   cada docente y cada grupo están bien emparejados y pulsar **Guardar horario en la hoja**.

## Funciones para ejecutar desde el editor de Apps Script

- `configurarHoja`: crea las pestañas que falten (no borra nada).
- `limpiarCache`: si la app no refleja un cambio hecho en la hoja.
- `cerrarSalidasAbiertas`: cierra salidas que se quedaron abiertas de días anteriores.
