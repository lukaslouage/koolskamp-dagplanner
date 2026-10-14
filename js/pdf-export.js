// Builds the two-page A4 PDF in the browser and shows it in a new tab (or downloads it), without the print dialog.
// The page must already be in print layout (html.is-printing). Libraries load on first use only.
window.KK = window.KK || {};

KK.pdfExport = (function () {
  const LIBRARIES = [
    'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  ];
  const PAGE = { width: 297, height: 210, margin: 9 }; // A4 landscape in mm

  let loading = null;
  function loadLibraries() {
    if (!loading) {
      loading = Promise.all(LIBRARIES.map(src => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Kon ${src} niet laden`));
        document.head.appendChild(script);
      })));
      loading.catch(() => { loading = null; }); // allow a retry after a network error
    }
    return loading;
  }

  const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
  let fontCss = null;

  /**
   * The page font as CSS with the font files inlined. html-to-image cannot read cross-origin
   * stylesheets itself, so without this the PDF would fall back to another font.
   */
  function loadFontCss() {
    if (!fontCss) {
      fontCss = (async () => {
        const css = await (await fetch(FONT_CSS)).text();
        // Keep only the latin subset: that covers all text on the page.
        const blocks = css.split(/(?=\/\* )/).filter(block => block.startsWith('/* latin */'));
        const inlined = await Promise.all(blocks.map(async block => {
          const match = block.match(/url\((https:[^)]+)\)/);
          if (!match) return block;
          const blob = await (await fetch(match[1])).blob();
          const dataUrl = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          return block.replace(match[1], dataUrl);
        }));
        return inlined.join('\n');
      })();
      fontCss.catch(() => { fontCss = null; });
    }
    return fontCss;
  }

  /** Copies a horizontal strip of a canvas into a JPEG data URL. */
  function strip(canvas, top, bottom) {
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = Math.max(1, bottom - top);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, top, canvas.width, out.height, 0, 0, canvas.width, out.height);
    return { url: out.toDataURL('image/jpeg', 0.92), width: out.width, height: out.height };
  }

  /**
   * Opens an empty tab. This has to happen straight in the click handler: a tab opened after the (slow)
   * PDF has been made would be blocked as a pop-up. Returns null when the browser refuses.
   */
  function openWaitingTab() {
    const tab = window.open('', '_blank');
    if (!tab) return null;
    try {
      tab.document.title = 'PDF wordt gemaakt';
      tab.document.body.style.cssText = 'margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font:500 16px system-ui,sans-serif;color:#52525B;background:#F6F6F7';
      tab.document.body.textContent = 'PDF wordt gemaakt';
    } catch (e) { /* the tab stays blank, which is fine */ }
    return tab;
  }

  /** Shows the PDF in the tab from openWaitingTab(); without a usable tab it is downloaded instead. */
  function show(blob, tab, filename) {
    const url = URL.createObjectURL(blob); // not revoked: the tab (and a later 'save as') still needs it
    if (tab && !tab.closed) { tab.location.replace(url); return; }
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /** Renders `pageEl` to an image, cuts it in two at `splitEl` (the start of page 2) and returns both parts as one PDF blob. */
  async function build(pageEl, splitEl) {
    const [, fontEmbedCSS] = await Promise.all([loadLibraries(), loadFontCss().catch(() => '')]);
    await document.fonts.ready;
    const options = { pixelRatio: 2, backgroundColor: '#FFFFFF', cacheBust: false, fontEmbedCSS };
    // Safari sometimes leaves images and fonts out of the first render; a warm-up render fixes that.
    if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) await window.htmlToImage.toCanvas(pageEl, options);
    const canvas = await window.htmlToImage.toCanvas(pageEl, options);

    const scale = canvas.width / pageEl.getBoundingClientRect().width;
    const pageTop = pageEl.getBoundingClientRect().top;
    const splitAt = Math.round((splitEl.getBoundingClientRect().top - pageTop) * scale);
    const parts = [strip(canvas, 0, splitAt), strip(canvas, splitAt, canvas.height)];

    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const maxWidth = PAGE.width - 2 * PAGE.margin, maxHeight = PAGE.height - 2 * PAGE.margin;
    parts.forEach((part, i) => {
      if (i > 0) pdf.addPage();
      const fit = Math.min(maxWidth / part.width, maxHeight / part.height);
      pdf.addImage(part.url, 'JPEG', PAGE.margin, PAGE.margin, part.width * fit, part.height * fit);
    });
    pdf.setProperties({ title: 'Koolskamp Koers Dagplanner' });
    return pdf.output('blob');
  }

  return { build, show, openWaitingTab };
})();
