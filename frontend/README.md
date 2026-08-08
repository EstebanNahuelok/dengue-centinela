# Dengue Watch Salta

Quiero que construyas el mockup web de "Dengue Centinela", una app de

vigilancia comunitaria de dengue para Salta, Argentina. Es un proyecto de

hackathon (MVP en 24h), así que priorizá una demo visualmente sólida y

funcional con datos simulados por sobre backend real — todavía no hay API.

## Producto

Los vecinos reportan síntomas o criaderos de mosquitos (agua estancada) con

foto, por WhatsApp o por un formulario web. Un agente cruza cada reporte con

datos climáticos (lluvia reciente, temperatura) y genera un mapa de calor de

riesgo por zona en tiempo real. Cuando una zona supera un umbral, se dispara

una alerta automática al municipio y a los vecinos cercanos.

El mapa de calor usa una grilla de hexágonos (H3), no polígonos de barrios.

Cada hexágono se colorea según su score de riesgo.

## Identidad visual — usar exactamente estos valores

- Modo oscuro por defecto. Fondo base #0D1117, superficies #161B22, bordes

  #28313C, texto principal #E6EDF3, texto secundario #9AA7B4.

- Escala de riesgo (bajo → alto), usar siempre en este orden para el heatmap

  y cualquier indicador de severidad: #2DD4BF (teal, bajo) → #34D399 (verde)

  → #FBBF24 (ámbar, medio) → #F87171 (coral, alto).

- Logo: un pin de ubicación con gradiente teal→verde→ámbar→coral, con la

  silueta de un mosquito de perfil (alas, patas finas, proboscis) centrada

  adentro, en color claro. Voy a subir el archivo SVG del ícono — usalo como

  favicon y en el header. Si no lo subo a tiempo, usá un pin de mapa simple

  con un punto pulsante como placeholder temporal.

- Tipografía sans-serif del sistema, limpia. Nada de gradientes decorativos

  fuera de la escala de riesgo — el color siempre debe significar algo

  (severidad), no ser solo estético.

- Tono: serio pero no alarmista. Es una herramienta de salud pública, no una

  app de terror.

## Pantallas a construir

**1. Landing / Home**

Hero con el logo, el nombre, una frase que explique el propósito en una

línea, y un CTA a "Reportar" y otro a "Ver el mapa". Debajo, 3-4 tarjetas

explicando cómo funciona (reportar → analizar → alertar).

**2. Mapa de riesgo (pantalla principal)**

Mapa a pantalla completa con una grilla de hexágonos coloreados según score

de riesgo (usá datos simulados: ~40-60 hexágonos, la mayoría bajo/verde,

un clúster de 4-6 en ámbar/coral simulando un brote en una zona). Al pasar el

mouse o tocar un hexágono, mostrar un popover con: nivel de riesgo, cantidad

de reportes, último reporte, si hubo lluvia reciente. Un panel lateral (o

inferior en mobile) con: leyenda de colores, filtro por fecha, contador total

de reportes activos, y un botón destacado "Reportar en mi zona".

**3. Formulario de reporte**

Mobile-first (muchos vecinos entrarán desde el link de WhatsApp). Pasos:

tipo de reporte (síntomas / criadero / ambos) → ubicación (mapa mini con pin

arrastrable o botón "usar mi ubicación") → si es síntomas: checklist simple

de síntomas comunes (fiebre, dolor de cabeza, dolor muscular, sarpullido) →

si es criadero: subir foto (mock del input, no hace falta procesarla de

verdad) → confirmación con disclaimer visible: "Esto no es un diagnóstico

médico. Si tenés síntomas, consultá al sistema de salud." Pantalla final de

éxito con un mensaje breve.

**4. Panel del municipio (admin)**

Vista de lista/tabla de zonas ordenadas por riesgo descendente, con badge de

color por severidad, cantidad de reportes, tendencia (subiendo/bajando/

estable con una flechita), y botón "Marcar como intervenido". Arriba, 3-4

KPIs grandes: zonas en alerta alta, reportes últimas 24h, zonas nuevas esta

semana. Incluí un pequeño gráfico de línea de reportes en el tiempo (7 días,

datos mock).

**5. Historial de alertas**

Lista simple tipo timeline: fecha, zona, nivel que la disparó, a quién se

notificó (municipio / vecinos / ambos), con datos simulados de los últimos

días.

## Datos simulados

Poblá todo con datos mock realistas de barrios/zonas de Salta capital (podés

inventar 8-10 nombres de zona genéricos tipo "Zona Norte", "Centro",

"Tres Cerritos", etc. si no tenés los reales). Que el mapa se vea "vivo":

nunca vacío, con al menos un clúster de riesgo alto para que la demo

impresione.

## Reglas

- No implementes autenticación real ni backend — todo con estado local /

  datos mock, dejando comentarios claros de dónde iría la llamada a la API

  real (endpoints tipo POST /reports, GET /risk-map).

- Priorizá que el flujo demo funcione de punta a punta: reportar → ver el

  hexágono de esa zona subir de nivel → verlo reflejado en el panel del

  municipio. Esa transición es el corazón de la demo, no la dejes para el

  final.

- Responsive real, mobile-first en el formulario de reporte y en el mapa.

- Componentes reutilizables: badge de riesgo, tarjeta de zona, popover de

  hexágono — los vas a necesitar repetidos en varias pantallas.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/daecbe3d-5377-4788-9f7f-e4d73e63c37a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
