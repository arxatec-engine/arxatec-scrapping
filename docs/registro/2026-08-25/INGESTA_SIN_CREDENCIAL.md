# La ingesta escribe en el corpus de producción sin credencial

> Escrito 2026-08-25 · verificado contra `main` (`faf490e`) y contra el informe
> del despliegue del VPS de esa misma fecha.
> Método: identificación del cliente por la versión que aparece en el log de
> nginx de producción, contrastada con los `package.json` de los cuatro repos
> Node, y lectura del constructor del cliente.
> Fecha por `date +%F` (local `-05`), contrastada con la cabecera `Date` de
> google.com.

## Qué se vio

Durante el despliegue del 2026-08-25, el log de nginx de producción mostraba
peticiones **en curso** contra el corpus legal:

```text
38.211.62.41  qdrant-js/1.17.0
  PUT  /collections/legal_documents_pe/points
  POST /collections/legal_documents_pe/points/delete
```

**Sin credencial, por el dominio público.** Escrituras y borrados.

El corpus creció de **23 713 a 30 644 puntos** durante la sesión, así que no era
tráfico residual: alguien estaba ingiriendo en ese momento.

Desde el VPS no había forma de saber si era nuestro. Ese es el problema: **nada
lo distinguía de que no lo fuera**.

## Quién es

Es **este repo**. La identificación es de una sola línea:

| Repo | Cliente Qdrant |
| --- | --- |
| `arxatec-lawyer-service` | `@qdrant/js-client-rest` **1.16.2** |
| **`arxatec-scrapping`** | `@qdrant/js-client-rest` **~1.17.0** ← coincide |
| `arxatec-lawyer-assistant` | `qdrant-client` (Python) |

Y encaja con el resto: `src/services/ingest-local/qdrant.ts` escribe puntos
directamente cuando `INGEST_MODE=local`, que es justo la ruta que evita el
`POST /legal-documents/ingest` del assistant.

Hay incluso una pista escrita desde antes, en un comentario del propio fichero:

> «el nginx delante del **Qdrant remoto** responde 413»

O sea: que esta ingesta apunta a un Qdrant remoto detrás de nginx **ya se sabía**
el 2026-08-06. Lo que no estaba escrito en ningún sitio es que ese Qdrant es el
de producción y que se le escribe sin autenticación.

## Por qué bloqueaba el cierre de V-1

La fila **V-1** del tablero de despliegue pide cerrar ese Qdrant con api-key.
Aplicarla tal cual **habría roto la ingesta**, porque el cliente se construía
así:

```ts
client = new QdrantClient({ url: cfg.qdrantUrl, timeout: 120_000 });
```

Sin `apiKey`, y sin variable de entorno donde ponerla. La ingesta habría empezado
a recibir 401 en cada `PUT /points` y habría fallado entera — probablemente de
madrugada, que es cuando corren las campañas.

Ese es el motivo real de que V-1 llevara desde el 2026-07-24 sin cerrarse: no era
falta de tiempo, era una dependencia que nadie había visto.

## El arreglo

`QDRANT_API_KEY`, opcional, en la config de la ingesta local:

- Vacía → el cliente se construye igual que antes. Las instancias locales sin
  auth siguen funcionando sin tocar nada.
- Con valor → se manda en cada petición.

Deliberadamente **no** entra en la lista de variables obligatorias de
`localIngestConfig`: exigirla rompería a quien ingiere contra un Qdrant local
sin auth, que es el caso de desarrollo.

Es la misma clave que `QDRANT_API_KEY` del assistant y que `QDRANT_LEGAL_API_KEY`
del service. Las tres tienen que coincidir.

## Lo que esto NO arregla

| id | Qué | Estado |
| --- | --- | --- |
| **IC-1** | El corpus de producción **sigue abierto**. Este cambio solo permite cerrarlo sin romper nada; cerrarlo es la fila V-1 y se hace en el VPS | 🔴 abierto |
| IC-2 | La ingesta escribe contra producción **por el dominio público**, en claro. Aunque lleve credencial, el tráfico va por internet. Lo sano es una red privada o un túnel | 🟠 abierto |
| IC-3 | Nada distingue una ingesta nuestra de una ajena. Con la credencial puesta, la distinción existe; sin ella, no había ninguna | ✅ lo cierra V-1 |
| IC-4 | `POST /points/delete` contra producción desde un portátil sigue siendo posible por diseño. Merece pensarse si la ingesta debe poder borrar | 🟡 decisión |

## Orden para cerrar V-1 sin romper la ingesta

1. Mergear este cambio y desplegar el scrapper donde corra la ingesta.
2. Poner `QDRANT_API_KEY` en su `.env`, con la misma clave que el assistant.
3. **Solo entonces**, aplicar V-1 en el VPS.
4. Correr un smoke de ingesta (`pnpm verify <fuente>`) y comprobar que sigue
   escribiendo.

Si se hace al revés, la ingesta cae y el corpus deja de crecer sin que salte
ninguna alarma: el fallo se vería días después, como un corpus que no avanza.

## Registro de cambios

| Fecha | Cambio |
| --- | --- |
| 2026-08-25 | Nace. El despliegue del VPS detectó escrituras y borrados sin credencial contra el corpus de producción; se identifica que son de este repo por la versión del cliente, y se añade `QDRANT_API_KEY` para que cerrar V-1 no rompa la ingesta. |
