import test from 'node:test'
import assert from 'node:assert/strict'
import { PRODUCT_COPY_STYLE } from '../api/_lib/productCopyStyle.js'
import { buildEnhanceRequest } from '../api/_lib/productTextEnhance.js'
import { buildDraftRequest } from '../api/_lib/productPhotoDraft.js'

test('both product request builders include the same shared copy style verbatim', () => {
  const enhancement = buildEnhanceRequest({ field: 'description', text: 'esfera pokemon' }).instructions
  const photoDraft = buildDraftRequest({ images: [], note: 'esfera pokemon', categories: [] }).input[0].content[0].text
  assert.ok(PRODUCT_COPY_STYLE.trim())
  for (const prompt of [enhancement, photoDraft]) {
    assert.ok(prompt.includes(PRODUCT_COPY_STYLE))
    assert.doesNotMatch(prompt, /de forma atractiva|tono cálido, emocional|un gancho|2 a 4 oraciones/)
  }
})

test('shared copy style explicitly forbids every filler phrase and marketing device', () => {
  for (const phrase of ['ideal para', 'perfecto para', 'toque', 'llamativo', 'original', 'encantador', 'especial', 'único/única', 'aporta', 'presenta', 'acabado visual', 'pieza decorativa que', 'diseño cuidado', 'con mucho amor', 'dale vida', 'eleva', 'realza', 'sin duda']) {
    assert.ok(PRODUCT_COPY_STYLE.includes(`"${phrase}"`), phrase)
  }
  assert.match(PRODUCT_COPY_STYLE, /Frases de relleno prohibidas/)
  assert.match(PRODUCT_COPY_STYLE, /No use signos de exclamación, superlativos publicitarios ni preguntas retóricas/)
})

test('shared copy style grounds short owner descriptions and factual material fields', () => {
  for (const rule of [
    /dueño de un pequeño taller de Nicaragua/, /lenguaje sencillo y concreto/, /pocos adjetivos/, /trato de usted/,
    /description.*1 a 3 oraciones cortas/, /primera oración.*qué es.*diseño o tema/,
    /dónde colocarla.*a quién.*ocasión/, /personalización solo si el texto base o las notas la mencionan/,
    /No invente usos, ocasiones ni destinatarios/, /materiales ni técnicas.*palabra breve.*texto base o las notas/,
    /No incluya dimensiones.*campos separados/, /material.*materialTechnique.*1 a 2 oraciones.*solo hechos/,
    /Acrílico de 3 mm con impresión UV\./, /nombres propios y marcas.*Pokemon → Pokémon/,
  ]) assert.match(PRODUCT_COPY_STYLE, rule)
})

test('shared copy style includes exact good and bad examples without licensing their facts', () => {
  assert.match(PRODUCT_COPY_STYLE, /referencias de estilo.*nunca copie sus datos/)
  for (const example of [
    'Nacimiento en acrílico estilo vitral, con colores vivos que resaltan cuando le da la luz. Un detalle lindo para la mesa navideña o para regalar en esta época. Incluye grabado en la base: un nombre completo, apellido de familia o frase corta.',
    'Esfera estilo vitral con diseño de Pokémon. Para colgar en el árbol de Navidad o regalarle a un fan.',
  ]) assert.ok(PRODUCT_COPY_STYLE.includes(example), example)
  assert.ok(PRODUCT_COPY_STYLE.includes('Ejemplo malo, lo que debe evitar: "Esfera tipo vitral con diseño inspirado en Pokemon. Presenta un estilo decorativo que aporta un toque llamativo y original. Ideal para quienes buscan una pieza con acabado visual tipo vitral."'))
})
