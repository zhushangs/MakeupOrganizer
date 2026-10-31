# Vanity — Makeup Organizer

A small web app for cataloging makeup. Add an item (brand, product, shade, where you bought it, original and paid price, notes), then pick a picture from an online image search. A color card is generated from the picture automatically, and you can fine-tune it with an eyedropper or color picker. Each category can be viewed as one color chart, and both single cards and charts can be saved as images.

## Structure

```
server/MakeupOrganizer.Api   ASP.NET Core (.NET 8) backend, no NuGet dependencies
  ├─ wwwroot/                Built frontend (already built, ready to use)
  ├─ data/                   Created on first run: products.json + images/
  └─ appsettings.Local.json  Your Serper API key (you create this; git-ignored)
client/                      React + Vite frontend source (only needed to change the UI)
start.bat                    Double-click to start
```

## Setting up image search (one time)

Online image search uses [Serper.dev](https://serper.dev) (Google Images results). Sign-up is free with no credit card and includes 2,500 free searches.

1. Sign up at https://serper.dev and copy your API key from the dashboard.
2. Copy `server/MakeupOrganizer.Api/appsettings.Local.example.json` to `appsettings.Local.json` in the same folder.
3. Paste your key:
   ```json
   { "Serper": { "ApiKey": "your-key-here" } }
   ```
4. Restart the app.

`appsettings.Local.json` is in `.gitignore`, so the key never ends up on GitHub. Without a key the app still works; you just upload your own photos instead of searching.

## Running (requires .NET SDK 8 or newer)

1. Double-click `start.bat` (or run `dotnet run` in `server/MakeupOrganizer.Api`).
2. The console prints the addresses:
   - On this PC: http://localhost:5080
   - On your phone (same Wi-Fi): http://192.168.x.x:5080
3. The first time it runs, Windows Firewall shows a prompt. Allow access on **Private networks**, otherwise your phone can't connect.
4. Open the address on your phone. In Safari, tap Share → Add to Home Screen to use it like an app.

## How it works

- **Import from screenshots** (+ button): pick one or more order/cart screenshots. Text is read on the device with a free, built-in OCR engine (tesseract.js, no API key), then brand, product, shade, store and prices are guessed from it. Check and fix the rows, uncheck anything that isn't makeup, and save. Missing fields stay empty; add pictures and notes later from each item ("Find a picture & make the color card").
- **Add one item**: fill in the details → **Save & find a picture**.
- The app searches for "brand + product + shade" and shows the results. Tap the one that matches.
- The picture is downloaded to `data/images/` and the color card is generated from its most saturated dominant color. If it's off, drag on the picture to pick the exact spot, or use the color picker.
- Eyeshadow palettes: set rows × columns, then tap each pan on the picture; it moves to the next pan automatically.
- **View all as chart** shows the whole category as one color chart, sorted by color.
- Saving images on iPhone: press and hold the card or chart → **Save to Photos**. On a computer, use **Download**.

### Screenshot import tips

- Crop or zoom so the product rows are large; full-resolution phone screenshots work best.
- Recognition is English-only. Brands are matched against a built-in list in `client/src/receipt.ts` (add any you buy often).
- Struck-through original prices are hard to read and may come out a little off; double-check them.

## Changing the frontend (requires Node.js 18+)

```
cd client
npm install
npm run dev      # dev server at http://localhost:5173; /api is proxied to 5080 (keep the backend running)
npm run build    # builds into server/MakeupOrganizer.Api/wwwroot
```

## Backup

All data lives in `server/MakeupOrganizer.Api/data/`. Copying that folder is a full backup.
