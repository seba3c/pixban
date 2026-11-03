export const localePath = (lang) => lang === "es" ? "/es/" : "/";
export const pathLocale = (path) => /^\/es(?:\/|$)/.test(path) ? "es" : "en";

export const seo = {
  en: {
    title: "pixban — Pixelate images online, privately",
    heading: "Pixelate images online",
    description: "Pixelate faces, license plates and sensitive details with a rectangle or brush. Free image editor with no uploads or signup. Your images stay in your browser.",
    guide: "How to pixelate an image",
    steps: [
      "Open or drop a PNG, JPEG or WebP image up to 32 megapixels.",
      "Draw a rectangle or paint with the brush over faces, license plates or other details. Adjust the block size, move regions, and undo changes as needed.",
      "Download a flattened PNG or JPEG at the original resolution. Your original file stays untouched.",
    ],
    privacy: "Images are processed on your device and never uploaded. No account is required. Images and edit history are not saved when you reload or close the page.",
    caution: "Pixelation visually obscures details; it does not guarantee irreversible anonymization.",
    javascript: "Enable JavaScript to use the image editor. Processing happens locally in your browser.",
  },
  es: {
    title: "pixban — Pixelar imágenes online y en privado",
    heading: "Pixelar imágenes online",
    description: "Pixela caras, matrículas y detalles sensibles con un rectángulo o pincel. Editor de imágenes gratis, sin subir archivos ni registrarte. Todo en tu navegador.",
    guide: "Cómo pixelar una imagen",
    steps: [
      "Abre o arrastra una imagen PNG, JPEG o WebP de hasta 32 megapíxeles.",
      "Dibuja un rectángulo o pinta con el pincel sobre caras, matrículas u otros detalles. Ajusta el tamaño del bloque, mueve las regiones y deshaz cambios cuando lo necesites.",
      "Descarga un PNG o JPEG con las regiones integradas y la resolución original. El archivo original se conserva intacto.",
    ],
    privacy: "Las imágenes se procesan en tu dispositivo y nunca se suben a un servidor. No necesitas una cuenta. Las imágenes y el historial de edición se pierden al recargar o cerrar la página.",
    caution: "El pixelado oculta detalles visualmente; no garantiza una anonimización irreversible.",
    javascript: "Activa JavaScript para usar el editor de imágenes. El procesamiento se realiza localmente en tu navegador.",
  },
};

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

export function renderGuide(lang) {
  const t = seo[lang];
  return `<summary>${t.guide}</summary><ol>${t.steps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol><p>${t.privacy}</p><p>${t.caution}</p>`;
}

export function renderLanding(lang) {
  const t = seo[lang];
  return `<main class="static-landing"><a class="brand" href="${localePath(lang)}">pixban.</a><nav aria-label="Language"><a href="/" lang="en" hreflang="en">English</a> · <a href="/es/" lang="es" hreflang="es">Español</a></nav><h1>${t.heading}</h1><p>${t.description}</p><details open class="image-guide">${renderGuide(lang)}</details><noscript><p>${t.javascript}</p></noscript></main>`;
}

export function renderHead(lang, origin = "") {
  const t = seo[lang];
  const url = origin ? origin + localePath(lang) : "";
  const meta = (name, content, property = false) => `<meta data-seo ${property ? "property" : "name"}="${name}" content="${escapeHtml(content)}" />`;
  const app = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "pixban",
    description: t.description,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript and HTML Canvas support.",
    inLanguage: lang,
    isAccessibleForFree: true,
    featureList: t.steps,
    ...(url ? { url } : {}),
  };
  return [
    `<title data-seo>${escapeHtml(t.title)}</title>`,
    meta("description", t.description),
    meta("robots", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"),
    meta("og:type", "website", true),
    meta("og:site_name", "pixban", true),
    meta("og:title", t.title, true),
    meta("og:description", t.description, true),
    meta("og:locale", lang === "es" ? "es_ES" : "en_US", true),
    meta("og:locale:alternate", lang === "es" ? "en_US" : "es_ES", true),
    meta("twitter:card", "summary"),
    meta("twitter:title", t.title),
    meta("twitter:description", t.description),
    ...(url ? [
      `<link data-seo rel="canonical" href="${escapeHtml(url)}" />`,
      ...["en", "es", "x-default"].map(locale => `<link data-seo rel="alternate" hreflang="${locale}" href="${escapeHtml(origin + localePath(locale))}" />`),
      meta("og:url", url, true),
    ] : []),
    `<link data-seo rel="alternate" type="text/plain" href="/llms.txt" title="About pixban" />`,
    `<script data-seo type="application/ld+json">${JSON.stringify(app).replace(/</g, "\\u003c")}</script>`,
  ].join("\n    ");
}

export function updatePageMetadata(lang) {
  const canonical = document.querySelector('link[rel="canonical"]');
  const origin = canonical ? new URL(canonical.href).origin : "";
  const template = document.createElement("template");
  template.innerHTML = renderHead(lang, origin);
  document.head.querySelectorAll("[data-seo]").forEach(node => node.remove());
  document.head.append(template.content);
}
