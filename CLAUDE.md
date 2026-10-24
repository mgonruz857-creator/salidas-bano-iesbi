# Instrucciones para Claude – Salidas al baño (GBCS) del IES Blas Infante

## Con quién trabajas

- **Miguel Ángel González**, profesor e ingeniero informático del centro. **Responder siempre en español**, claro y sin jerga.
- Las mismas normas que la app de convivencia (`mgonruz857-creator/ConvivenciaIesbiClaude`, ver su CLAUDE.md):
  1. Todo se prueba primero en **PRUEBAS**; al centro solo cuando él lo diga.
  2. **Nunca datos reales** en el repositorio ni en las pruebas. Un archivo real que aporte (p. ej. un PDF de
     horarios) se usa solo para lo pedido y se borra al terminar.
  3. No tener ni pedir la contraseña de la cuenta del centro (14007180.aplicaciones@g.educaand.es): los pasos en
     Apps Script con esa cuenta los hace él, con instrucciones paso a paso (ver `DESPLIEGUE.md`).

## Qué es

App web para autorizar y registrar las salidas al baño (PRD v3.1.0 de Miguel Ángel), pensada para integrarse
después en la app de convivencia: mismo estilo (React + TypeScript + Vite + Tailwind v4 + lucide-react, GitHub
Pages), mismo tipo de servidor (Apps Script por POST con `accion`), mismo acceso (correo + contraseña con sal
en las propiedades del script, sesión de 6 h) y mismos códigos de grupo e identificadores de alumno.

- `servidor/Code.gs`: servidor. Va dentro de la hoja de cálculo (pestañas Profesorado, Alumnado,
  Historico_Salidas, Horario). Se pega tal cual en Apps Script.
- `src/`: la app. `src/config/entorno.ts` elige PRUEBAS / PRODUCCION y la URL del servidor.
- `src/services/horarioSeneca.ts`: lee el PDF "Horarios de profesores" de Séneca (en el navegador, con pdf.js).

## Reglas (PRD)

- Lunes a viernes. Bloque 1 08:30–11:30 (preferente A 09:30–10:30), recreo 11:30–12:00 sin salidas,
  bloque 2 12:00–15:00 (preferente B 13:00–14:00). Fuera de la hora preferente, motivo de ≥ 5 caracteres.
- Cupo: ≤ 5 fuera en todo el centro y ≤ 1 por grupo, con `LockService`.
- 1 salida por alumno y bloque; la 2ª es excepcional con justificación de ≥ 10 caracteres y avisa de quién
  autorizó la anterior y a qué hora.
- Temporizador de 5 minutos. Cualquier docente puede marcar el regreso; quien autorizó puede anular en 2 min.
- Al terminar un bloque, las salidas sin regreso se cierran como `NO_RETURN` (decisión propuesta por Claude).
- Equipo Directivo (`rol` = DIRECTIVO): histórico, profesorado, restablecer contraseñas e importar horarios.

## Pruebas

- `npm test`: servidor (simulador de Apps Script en `pruebas/simulador.mjs`) y lector de horarios, con datos ficticios.
- `npm run build`: tipos y compilación.
- Probar la app sin Google: `SIM_DESDE="2026-10-23 09:40" node pruebas/servidor-local.mjs` y
  `VITE_URL_API=http://localhost:8787 npm run dev`.
