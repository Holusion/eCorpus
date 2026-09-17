'use strict';

const SHAPE_GEOMETRY = {
  sphere: {
    fields: ["diameter"],
    surface: ({ diameter }) => Math.PI * diameter * diameter,
    alpha: 0.5,
  },
  cube: {
    fields: ["cube-length", "cube-width", "cube-height"],
    surface: ({ "cube-length": length, "cube-width": width, "cube-height": height }) =>
      2 * (length * width + width * height + height * length),
    alpha: 0.15,
  },
  plane: {
    fields: ["width", "height"],
    surface: ({ width, height }) => width * height,
    alpha: 0.3,
  },
};

const TEXEL_EFFICIENCY = 1.2;

// Faces-per-texel ratio for the reference shape (sphere) at "typical" complexity.
// Other shapes are scaled by REFERENCE_ALPHA / alpha: sharper primitives (e.g. a
// cube's edges) need relatively more faces per texel than a smooth sphere.
const FACES_PER_TEXEL_REFERENCE = 0.1;
const REFERENCE_ALPHA = SHAPE_GEOMETRY.sphere.alpha;
// 1 face per texel is a hard ceiling: beyond that, extra geometry can't carry any
// more detail than the texture already resolves.
const FACES_PER_TEXEL_CEILING = 1;

// Vertex-count reduction granted by a normal map (assuming a 1:1 diffuse/normal
// texel count), at "typical" complexity. Smoother subjects have less silhouette/
// occlusion detail for the normal map to miss, so it can take over more of the
// geometry budget; highly intricate subjects keep less of that benefit.
const NORMAL_MAP_TAKEOVER_REFERENCE = 2;

const CALC_IMAGE_BASE = "/assets/img/resolution";

let VRES_LEVELS = [];
let COMPLEXITY_LEVELS = [];

let CALC_LOCALE = "fr-FR";

const QUERY_FIELD_IDS = [
  "calc-unit",
  "calc-diameter",
  "calc-cube-length",
  "calc-cube-width",
  "calc-cube-height",
  "calc-width",
  "calc-height",
  "calc-vres-level",
  "calc-cx-level",
  "calc-model-count",
];

function readLevels(datalistId, reader) {
  return Array.from(document.querySelectorAll(`#${datalistId} option`))
    .sort((a, b) => Number(a.value) - Number(b.value))
    .map(reader);
}

function readVresLevels() {
  return readLevels("calc-vres-ticks", (option) => ({
    label: option.dataset.label,
    densityM: parseFloat(option.dataset.densityM),
    fontLabel: option.dataset.fontLabel,
    objectLabel: option.dataset.objectLabel,
    textTitle: option.dataset.textTitle,
    objectTitle: option.dataset.objectTitle,
  }));
}

function readComplexityLevels() {
  return readLevels("calc-cx-ticks", (option) => ({
    number: Number(option.value) + 1,
    label: option.dataset.label,
    factor: parseFloat(option.dataset.factor),
    description: option.dataset.description,
  }));
}

function getUnitLabel() {
  const select = document.getElementById("calc-unit");
  return select?.selectedOptions[0]?.dataset.label || "";
}

function formatNumber(n) {
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString(CALC_LOCALE);
  return parseFloat(n.toFixed(3)).toLocaleString(CALC_LOCALE);
}

function roundUpToMultiple(n, step) {
  return Math.ceil(n / step) * step;
}

function formatVertexCount(n) {
  const unit = Math.abs(n) >= 1_000_000 ? "M" : "k";
  const scaled = n / (unit === "M" ? 1_000_000 : 1_000);
  return `${scaled.toLocaleString(CALC_LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unit}`;
}

function fillTemplate(template, params) {
  return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? "");
}

function setOutput(id, value) {
  const el = document.getElementById(id);
  el.textContent = value === null ? el.dataset.placeholder : fillTemplate(el.dataset.template, { value });
}

function getVresLevel() {
  const slider = document.getElementById("calc-vres-level");
  return VRES_LEVELS[parseInt(slider.value, 10)];
}

function getComplexityLevel() {
  const slider = document.getElementById("calc-cx-level");
  return COMPLEXITY_LEVELS[parseInt(slider.value, 10)];
}

function vresDensityForUnit(level, unitFactor) {
  return level.densityM * 1_000_000 * unitFactor * unitFactor;
}

function setIllustration(exampleId, src) {
  const example = document.getElementById(exampleId);
  const img = example.querySelector(".calc-vres-image");
  const placeholder = example.querySelector(".calc-vres-placeholder");
  img.hidden = false;
  placeholder.hidden = true;
  img.src = src;
}

function onImageError(e) {
  const img = e.target;
  img.hidden = true;
  const placeholder = img.parentElement.querySelector(".calc-vres-placeholder");
  placeholder.hidden = false;
  placeholder.querySelector("code").textContent = img.src.split("/").pop();
}

function updateVresDisplay() {
  const level = getVresLevel();
  document.getElementById("calc-vres-level-label").textContent = level.label;

  const densityEl = document.getElementById("calc-vres-level-density");
  densityEl.textContent = fillTemplate(densityEl.dataset.template, {
    value: formatNumber(vresDensityForUnit(level, getUnitFactor())),
    unit: getUnitLabel(),
  });

  document.getElementById("calc-vres-text-value").textContent = level.fontLabel;
  document.getElementById("calc-vres-object-value").textContent = level.objectLabel;

  const textExample = document.getElementById("calc-vres-example-text");
  textExample.title = level.textTitle;
  setIllustration("calc-vres-example-text", `${CALC_IMAGE_BASE}/text-${level.densityM}m.webp`);

  const objectExample = document.getElementById("calc-vres-example-object");
  objectExample.title = level.objectTitle;
  setIllustration("calc-vres-example-object", `${CALC_IMAGE_BASE}/object-${level.densityM}m.webp`);
}

function updateComplexityDisplay() {
  const level = getComplexityLevel();
  document.getElementById("calc-cx-level-label").textContent = level.label;
  document.getElementById("calc-cx-level-description").textContent = level.description;

  setIllustration("calc-cx-example", `${CALC_IMAGE_BASE}/cx-${level.number}.webp`);
}

function getShape() {
  const checked = document.querySelector('input[name="calc-shape"]:checked');
  return checked ? checked.value : null;
}

function getUnitFactor() {
  const select = document.getElementById("calc-unit");
  return select ? parseFloat(select.value) : 1;
}

function getShapeMetrics(shape) {
  const def = SHAPE_GEOMETRY[shape];
  if (!def) return null;
  const unitFactor = getUnitFactor();
  const values = {};
  for (const field of def.fields) {
    const input = document.getElementById(`calc-${field}`);
    const raw = input ? parseFloat(input.value) : NaN;
    if (!Number.isFinite(raw) || raw <= 0) return null;
    values[field] = raw * unitFactor;
  }
  return { surface: def.surface(values) };
}

function updateSizeFieldsVisibility(shape) {
  document.querySelectorAll(".calc-size-fields .calc-field").forEach((field) => {
    const relevant = field.dataset.shape === shape;
    field.hidden = !relevant;
    const input = field.querySelector("input");
    if (!input) return;
    input.required = relevant;
    if (!relevant) input.setCustomValidity("");
  });
}

function clearSizeFields() {
  document.querySelectorAll('.calc-size-fields input[type="number"]').forEach((input) => {
    input.value = "";
    input.setCustomValidity("");
  });
}

function transferSizeFields(fromShape, toShape) {
  const fromFields = fromShape ? SHAPE_GEOMETRY[fromShape].fields : [];
  const values = fromFields.map((field) => document.getElementById(`calc-${field}`)?.value || "");

  clearSizeFields();
  if (!toShape) return;

  SHAPE_GEOMETRY[toShape].fields.forEach((field, i) => {
    if (!values[i]) return;
    const input = document.getElementById(`calc-${field}`);
    if (!input) return;
    input.value = values[i];
    applyPositiveValidity(input);
  });
}

function applyPositiveValidity(input) {
  if (input.value === "") {
    input.setCustomValidity("");
    return;
  }
  const value = parseFloat(input.value);
  const message = input.closest(".calc-size-fields")?.dataset.positiveMessage || "";
  input.setCustomValidity(Number.isFinite(value) && value > 0 ? "" : message);
}

function syncQueryString() {
  const params = new URLSearchParams();

  const shape = getShape();
  if (shape) params.set("shape", shape);

  for (const id of QUERY_FIELD_IDS) {
    const el = document.getElementById(id);
    if (!el || el.value === "") continue;
    if (el.closest(".calc-field")?.hidden) continue;
    params.set(id.replace(/^calc-/, ""), el.value);
  }

  params.set("nm", document.getElementById("calc-normal-map-toggle").checked ? "1" : "0");

  const query = params.toString();
  history.replaceState(null, "", query ? `?${query}` : location.pathname);
}

function restoreFromQueryString() {
  const params = new URLSearchParams(location.search);

  const shape = params.get("shape");
  if (shape) {
    const radio = document.querySelector(`input[name="calc-shape"][value="${shape}"]`);
    if (radio) radio.checked = true;
  }

  for (const id of QUERY_FIELD_IDS) {
    const key = id.replace(/^calc-/, "");
    if (!params.has(key)) continue;
    const el = document.getElementById(id);
    if (!el) continue;
    el.value = params.get(key);
    if (el.matches(".calc-size-fields input")) applyPositiveValidity(el);
  }

  const nm = params.get("nm");
  if (nm !== null) document.getElementById("calc-normal-map-toggle").checked = nm === "1";

  if (shape) updateSizeFieldsVisibility(shape);
}

function applyResultState(valid) {
  document.getElementById("calc-result-hint").hidden = valid;
  document.querySelector(".calc-output").classList.toggle("is-disabled", !valid);
}

function recompute(form) {
  const shape = getShape();
  if (shape) updateSizeFieldsVisibility(shape);
  const metrics = shape ? getShapeMetrics(shape) : null;

  updateVresDisplay();
  updateComplexityDisplay();

  const valid = form.checkValidity();
  applyResultState(valid);

  if (!valid || !metrics) {
    setOutput("calc-out-texture", null);
    setOutput("calc-out-vertices", null);
    return;
  }

  const { surface } = metrics;
  const densityPerM2 = getVresLevel().densityM * 1_000_000;
  const complexityFactor = getComplexityLevel().factor;

  const generateNormalMap = document.getElementById("calc-normal-map-toggle").checked;
  const normalMapTakeover = generateNormalMap ? NORMAL_MAP_TAKEOVER_REFERENCE * Math.sqrt(complexityFactor) : 1;

  const modelCount = Math.max(1, parseInt(document.getElementById("calc-model-count").value, 10) || 1);

  const textureResolution = (Math.sqrt(surface * densityPerM2) * TEXEL_EFFICIENCY) / modelCount;

  const texelCount = surface * densityPerM2;
  const facesPerTexel = Math.min(
    (FACES_PER_TEXEL_REFERENCE * REFERENCE_ALPHA) / (SHAPE_GEOMETRY[shape].alpha * Math.sqrt(complexityFactor)),
    FACES_PER_TEXEL_CEILING,
  );
  const faceCount = (texelCount * facesPerTexel) / normalMapTakeover;
  const vertexCount = faceCount / 2 / modelCount;

  setOutput("calc-out-texture", roundUpToMultiple(textureResolution, 4).toLocaleString(CALC_LOCALE));
  setOutput("calc-out-vertices", formatVertexCount(vertexCount));
}

function initCalculator() {
  const calculator = document.querySelector(".calculator");
  if (!calculator) return;

  CALC_LOCALE = calculator.dataset.locale || "fr-FR";
  VRES_LEVELS = readVresLevels();
  COMPLEXITY_LEVELS = readComplexityLevels();

  const vresSlider = document.getElementById("calc-vres-level");
  const cxSlider = document.getElementById("calc-cx-level");
  vresSlider.max = VRES_LEVELS.length - 1;
  cxSlider.max = COMPLEXITY_LEVELS.length - 1;

  restoreFromQueryString();
  let currentShape = getShape();

  const recomputeAll = () => {
    recompute(calculator);
    syncQueryString();
  };

  calculator.addEventListener("submit", (e) => e.preventDefault());

  calculator.addEventListener("reset", () => {
    window.setTimeout(() => {
      clearSizeFields();
      updateSizeFieldsVisibility(null);
      currentShape = null;
      recompute(calculator);
      history.replaceState(null, "", location.pathname);
    }, 0);
  });

  calculator.querySelectorAll('input[name="calc-shape"]').forEach((input) => {
    input.addEventListener("change", () => {
      const newShape = getShape();
      transferSizeFields(currentShape, newShape);
      currentShape = newShape;
      recomputeAll();
    });
  });

  vresSlider.addEventListener("input", recomputeAll);
  cxSlider.addEventListener("input", recomputeAll);

  calculator.querySelectorAll(".calc-vres-image").forEach((img) => {
    img.addEventListener("error", onImageError);
  });

  calculator.addEventListener("input", (e) => {
    if (e.target.matches('input[name="calc-shape"]')) return;
    if (e.target === vresSlider || e.target === cxSlider) return;
    if (e.target.matches(".calc-size-fields input")) applyPositiveValidity(e.target);
    recomputeAll();
  });

  calculator.addEventListener("focusout", (e) => {
    if (typeof e.target.reportValidity === "function") e.target.reportValidity();
    window.setTimeout(recomputeAll, 0);
  });

  recomputeAll();
}

window.addEventListener("load", initCalculator);
