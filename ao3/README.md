# AO3 HTML to EPUB Converter

A standalone, zero-dependency HTML web app that converts Archive of Our Own (AO3) HTML downloads (and general single-file HTML works) into standards-compliant **EPUB 3** e-books with **EPUB 2 (NCX)** fallback directly in the browser.

## Features

- **100% Client-Side & Offline-Ready**: No server, no build step, and no external CDN scripts. All parsing and ZIP packaging happen locally in your browser.
- **AO3 Structural Parsing**: Automatically extracts work title, author(s), fandoms, tags, language, summary, source URL, chapter headings (`#chapters` / `.meta.group` / `h2.heading`), chapter summaries, beginning/end notes, and afterword.
- **Multilingual & Unicode Support**:
  - Maps language labels to BCP-47 (`dc:language`) codes.
  - Auto-detects RTL scripts (Arabic, Persian, Hebrew, Urdu, etc.) and sets `dir="rtl"` and `page-progression-direction="rtl"`.
  - Built-in multilingual chapter heading dictionary (English, CJK `第X章/話/回/節`, Korean `제X화/장`, Spanish/Portuguese, French, German/Dutch, Italian, Russian/Ukrainian, Polish, Arabic/Persian, Hebrew, Turkish, Vietnamese, Hindi) plus custom user-defined keywords.
- **Strict XHTML Sanitization**: Cleans and serializes chapter content into valid XHTML so e-readers (Calibre, Apple Books, Kindle, Kobo, KOReader) render it cleanly without XML errors.
- **Customizable Output**: Edit metadata, rename/toggle chapters, preview chapter output, remove duplicate in-body chapter headings, choose typography, and optionally embed a cover image.

## Usage

### Run Locally
Open `index.html` directly in any modern browser (Chrome, Firefox, Safari, Edge).

### Deploy to GitHub Pages
1. Create a new repository on GitHub and upload the contents of this archive (`index.html`, `README.md`, `LICENSE`, `.gitignore`).
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, select your default branch (`main`) and `/ (root)`, then click **Save**.
4. Your converter will be live at `https://<your-username>.github.io/<repo-name>/`.

## License

MIT License — see [LICENSE](LICENSE) for details.
