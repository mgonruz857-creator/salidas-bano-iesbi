# Salidas al baño · IES Blas Infante (Córdoba)

App web para que el profesorado autorice y registre las salidas al baño del alumnado, con cupo del centro
(máx. 5) y por grupo (máx. 1), horas preferentes, bloqueo en el recreo, aviso de salidas repetidas y
temporizador de regreso. El Equipo Directivo consulta el histórico, que se guarda en una hoja de cálculo
del Drive del centro.

Hecha con la misma arquitectura que la app de convivencia (SIGC-BI) para poder integrarlas.

- Puesta en marcha paso a paso: [DESPLIEGUE.md](DESPLIEGUE.md)
- Notas técnicas y normas de trabajo: [CLAUDE.md](CLAUDE.md)

```bash
npm install
npm test        # pruebas con datos ficticios
npm run build
```
