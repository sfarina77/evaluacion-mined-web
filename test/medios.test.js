import { test } from "node:test";
import assert from "node:assert/strict";
import { urlEmbebibleDeVideo, esEmbedDePlataforma } from "../src/examen/medios.js";

test("convierte youtube watch a embed", () => {
  assert.equal(
    urlEmbebibleDeVideo("https://www.youtube.com/watch?v=ABC123&t=5s"),
    "https://www.youtube.com/embed/ABC123",
  );
});

test("convierte youtu.be corto a embed", () => {
  assert.equal(urlEmbebibleDeVideo("https://youtu.be/ABC123"), "https://www.youtube.com/embed/ABC123");
});

test("convierte vimeo a embed", () => {
  assert.equal(urlEmbebibleDeVideo("https://vimeo.com/76979871"), "https://player.vimeo.com/video/76979871");
});

test("un link directo de video se deja tal cual", () => {
  assert.equal(urlEmbebibleDeVideo("https://ejemplo.com/clase.mp4"), "https://ejemplo.com/clase.mp4");
});

test("url invalida devuelve null en vez de lanzar", () => {
  assert.equal(urlEmbebibleDeVideo("no es una url"), null);
});

test("distingue embed de plataforma vs archivo directo", () => {
  assert.equal(esEmbedDePlataforma("https://www.youtube.com/embed/ABC123"), true);
  assert.equal(esEmbedDePlataforma("https://player.vimeo.com/video/76979871"), true);
  assert.equal(esEmbedDePlataforma("https://ejemplo.com/clase.mp4"), false);
});
