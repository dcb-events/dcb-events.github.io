// "JSON" on a DCB example (extensions/dcb_notation.py) downloads the model its
// "Open in Playground" link carries: base64url(gzip(JSON)) after "#model=".
document.addEventListener('click', async (event) => {
    const link = event.target.closest('a[data-dcb-download]');
    if (!link || typeof DecompressionStream === 'undefined') {
        return;
    }
    event.preventDefault();
    const encoded = new URL(link.href).hash.replace(/^#model=/, '').replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const json = JSON.stringify(JSON.parse(await new Response(stream).text()), null, 2);
    const download = document.createElement('a');
    download.href = URL.createObjectURL(new Blob([json + '\n'], { type: 'application/json' }));
    download.download = link.dataset.dcbDownload;
    download.click();
    URL.revokeObjectURL(download.href);
});
