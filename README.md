# Vanity — Makeup Organizer

A small web app for cataloging makeup. Paste a product link to pull in the image and price automatically, browse each category as a wall of shade swatches, and set up eyeshadow palettes with a custom grid where you pick each pan's color straight from the product photo.

## Structure

```
server/MakeupOrganizer.Api   ASP.NET Core (.NET 8) backend, no NuGet dependencies
  ├─ wwwroot/                Built frontend (already built, ready to use)
  └─ data/                   Created on first run: products.json + images/
client/                      React + Vite frontend source (only needed to change the UI)
start.bat                    Double-click to start
```

## Running (requires .NET SDK 8 or newer)

1. Double-click `start.bat` (or run `dotnet run` in `server/MakeupOrganizer.Api`).
2. The console prints the addresses:
   - On this PC: http://localhost:5080
   - On your phone (same Wi-Fi): http://192.168.x.x:5080
3. The first time it runs, Windows Firewall shows a prompt. Allow access on **Private networks**, otherwise your phone can't connect.
4. Open the address on your phone. In Safari, tap Share → Add to Home Screen to use it like an app.

## Changing the frontend (requires Node.js 18+)

```
cd client
npm install
npm run dev      # dev server at http://localhost:5173; /api is proxied to 5080 (keep the backend running)
npm run build    # builds into server/MakeupOrganizer.Api/wwwroot
```

## How link parsing works

The backend endpoint `POST /api/scrape` fetches the page and tries, in order:

1. Sephora's embedded `linkStore` JSON (current shade, price, swatch image)
2. schema.org `Product` JSON-LD (Ulta, most department stores and brand sites)
3. `og:` / `product:` meta tags
4. `<title>`

Images are downloaded to `data/images/`. The default color comes from, in order: a color value on the page → the average color of the swatch image → the most saturated dominant color in the product image.
If it's off, fix it on the edit page with **Pick from image** or the **Color picker**.

Known limitations: some sites (Sephora in particular) have bot protection and may return 403. The app then asks you to upload an image and fill in the details manually.
Sites that require a login can't be scraped.

## Backup

All data lives in `server/MakeupOrganizer.Api/data/`. Copying that folder is a full backup.
