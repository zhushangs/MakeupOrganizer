# Vanity — Makeup Organizer

A small web app for cataloging makeup. Add an item (brand, product, shade, where you bought it, original and paid price, notes), then pick a picture from an online image search. A color card is generated from the picture automatically, and you can fine-tune it with an eyedropper or color picker. Each category can be viewed as one color chart, and both single cards and charts can be saved as images.

## Two ways to run it

- **On Cloudflare (recommended):** always on, works anywhere, nothing to start. See [Hosting on Cloudflare](#hosting-on-cloudflare).
- **On your PC:** `start.bat` runs the ASP.NET Core version on your Wi-Fi.

Both serve the same frontend and the same API; only the backend differs (`worker/` = Cloudflare, `server/` = ASP.NET Core).

## Structure

```
server/MakeupOrganizer.Api   ASP.NET Core (.NET 8) backend, no NuGet dependencies
  ├─ wwwroot/                Built frontend (already built, ready to use)
  ├─ data/                   Created on first run: products.json + images/
  └─ appsettings.Local.json  Your Serper API key (you create this; git-ignored)
client/                      React + Vite frontend source (only needed to change the UI)
worker/                      Cloudflare Worker backend (TypeScript): D1 database + R2 pictures
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
- **Categories & brands** (gear icon on the home page): add, rename, reorder or remove categories (a category can be marked as a palette with a default layout; one in use can't be removed), and keep your own brand list. Your brands and every brand you already own are suggested when typing and recognized in screenshot import. You can also add a category on the spot with **+ New** when adding an item. Stored in `data/settings.json`.
- **View all as chart** shows the whole category as one color chart, sorted by color.
- Saving images on iPhone: press and hold the card or chart → **Save to Photos**. On a computer, use **Download**.

### Screenshot import tips

- Crop or zoom so the product rows are large; full-resolution phone screenshots work best.
- A plain list works too (e.g. a Notes screenshot): one product per line or separated by commas, like `mac lipstick ruby woo, ysl lipstick 416`. Brand, product type and shade are split out; headings without a brand or product word are skipped.
- Recognition is English-only. Brands are matched against a built-in list plus your own brands (Categories & brands) and brands you already own.
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

## Hosting on Cloudflare

Everything runs on Cloudflare's free tier: the Worker serves the app and the API, **D1** stores items and settings, **R2** stores pictures.

### One-time setup (on your PC, needs Node.js 18+)

1. Create a free account at https://dash.cloudflare.com.
2. In the dashboard open **R2 Object Storage** and click **Get started** once to enable R2 (the free tier includes 10 GB; Cloudflare may ask for a payment method but doesn't charge within the free tier).
3. In a terminal:
   ```
   cd worker
   npm install
   npx wrangler login        # opens the browser to authorize
   npm run setup             # creates the database + bucket, builds and deploys
   npm run migrate-data      # copies your existing items, settings and pictures from server/MakeupOrganizer.Api/data
   ```
   `setup` prints the address, e.g. `https://makeup-organizer.<your-subdomain>.workers.dev`. If `appsettings.Local.json` has your Serper key, it's copied to the Worker automatically; otherwise run `npx wrangler secret put SERPER_API_KEY`.
4. Open the address on your phone and **Add to Home Screen**.

### Set a password (do this right away)

Without a password, anyone who finds the address could see and change your data.

```
cd worker
npm run set-password      # type the password you want (hidden), then Enter
```

Opening the app now shows a sign-in page; each phone/browser signs in once and stays signed in for a year. To change the password, run `npm run set-password` again (everyone gets signed out). **Sign out** is at the bottom of Categories & brands.

The pictures, data and image search are all behind the password; only the app icon and manifest (needed for Add to Home Screen) are public.

Alternatively you can use Cloudflare Access (email one-time codes): Workers & Pages → makeup-organizer → Settings → Domains & Routes → **Enable Access** next to `workers.dev`. Its free plan may ask for a payment method.

### Updating after code changes

```
cd worker
npm run deploy
```

### Notes

- `npm run dev` in `worker/` runs the Cloudflare version locally (with a local database) for testing.
- Pictures that were downloaded or uploaded but never saved to an item are cleaned up daily (cron trigger).
- After moving to Cloudflare, `start.bat` still works but uses its own separate local data; edits don't sync between the two.
