using System.Net;
using MakeupOrganizer.Api;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

// Secrets (the Serper API key) live in appsettings.Local.json, which is git-ignored
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

// Data folder: defaults to data/ under the project folder; change "DataDir" in appsettings.json
var dataDir = builder.Configuration["DataDir"] is { Length: > 0 } d
    ? Path.GetFullPath(d, builder.Environment.ContentRootPath)
    : Path.Combine(builder.Environment.ContentRootPath, "data");

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
});

builder.Services.AddHttpClient("web", c =>
{
    c.Timeout = TimeSpan.FromSeconds(20);
    c.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36");
    c.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Language", "en-US,en;q=0.9,zh-CN;q=0.8");
}).ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
{
    AutomaticDecompression = DecompressionMethods.All,
    AllowAutoRedirect = true,
    MaxAutomaticRedirections = 10,
    UseCookies = true,
    CookieContainer = new CookieContainer(),
});

builder.Services.AddSingleton(new ProductStore(dataDir));
builder.Services.AddSingleton(new SettingsStore(dataDir));
builder.Services.AddSingleton(sp => new ImageService(dataDir,
    sp.GetRequiredService<IHttpClientFactory>(), sp.GetRequiredService<ILogger<ImageService>>()));
builder.Services.AddSingleton<ImageSearchService>();

// During development the frontend runs on Vite (5173), so allow CORS
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors();

// Frontend (built into wwwroot)
app.UseDefaultFiles();
app.UseStaticFiles();

// Images
var images = app.Services.GetRequiredService<ImageService>();
app.UseStaticFiles(new StaticFileOptions
{
    RequestPath = "/images",
    FileProvider = new PhysicalFileProvider(images.ImagesDir),
    // The default provider doesn't know .avif, so those images were returned as 404
    ContentTypeProvider = ImageService.ContentTypes,
    OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "public,max-age=31536000,immutable"
});

var api = app.MapGroup("/api");

api.MapGet("/products", async (ProductStore s) => await s.GetAllAsync());

api.MapGet("/products/{id}", async (string id, ProductStore s) =>
    await s.GetAsync(id) is { } p ? Results.Ok(p) : Results.NotFound());

api.MapPost("/products", async (Product p, ProductStore s) =>
{
    var created = await s.AddAsync(p);
    return Results.Created($"/api/products/{created.Id}", created);
});

api.MapPut("/products/{id}", async (string id, Product p, ProductStore s, ImageService img) =>
{
    var old = await s.GetAsync(id);
    if (old is null) return Results.NotFound();
    var oldImages = new[] { old.ImagePath };
    var updated = await s.UpdateAsync(id, p);
    // If the image was replaced, delete the old one when nothing else uses it
    foreach (var path in oldImages)
        if (path is not null && !s.IsImageReferenced(path)) img.TryDelete(path);
    return Results.Ok(updated);
});

api.MapDelete("/products/{id}", async (string id, ProductStore s, ImageService img) =>
{
    var removed = await s.DeleteAsync(id);
    if (removed is null) return Results.NotFound();
    foreach (var path in new[] { removed.ImagePath })
        if (path is not null && !s.IsImageReferenced(path)) img.TryDelete(path);
    return Results.NoContent();
});

api.MapPost("/images", async (IFormFile file, ImageService img) =>
{
    if (file.Length > ImageService.MaxBytes) return Results.BadRequest(new { error = "Image is too large" });
    await using var s = file.OpenReadStream();
    var path = await img.SaveAsync(s, file.ContentType);
    return path is null ? Results.BadRequest(new { error = "Unsupported image format" }) : Results.Ok(new { path });
}).DisableAntiforgery();

api.MapGet("/settings", async (SettingsStore s) => await s.GetAsync());
api.MapPut("/settings", async (AppSettings body, SettingsStore s) => await s.SaveAsync(body));

api.MapGet("/image-search/status", (ImageSearchService search) => Results.Ok(new { configured = search.IsConfigured }));

api.MapPost("/image-search", async (ImageSearchRequest req, ImageSearchService search, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(req.Query)) return Results.BadRequest(new { error = "Enter something to search for" });
    try { return Results.Ok(await search.SearchAsync(req.Query.Trim(), ct)); }
    catch (ImageSearchException ex) { return Results.BadRequest(new { error = ex.Message }); }
});

// Download a picked search result to local storage (falls back to the thumbnail if the site blocks it)
api.MapPost("/images/from-url", async (ImageFromUrlRequest req, ImageService img, CancellationToken ct) =>
{
    foreach (var url in new[] { req.Url, req.FallbackUrl })
    {
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var u) || (u.Scheme != "http" && u.Scheme != "https"))
            continue;
        if (await img.DownloadAsync(url, null, ct) is { } path) return Results.Ok(new { path });
    }
    return Results.BadRequest(new { error = "Couldn't download that image. Try another one." });
});

// SPA fallback
app.MapFallbackToFile("index.html");

// Startup cleanup: images that were downloaded or uploaded but never saved (older than 1 day, not referenced)
{
    var store = app.Services.GetRequiredService<ProductStore>();
    foreach (var f in Directory.EnumerateFiles(images.ImagesDir))
    {
        var path = "/images/" + Path.GetFileName(f);
        if (File.GetLastWriteTimeUtc(f) < DateTime.UtcNow.AddDays(-1) && !store.IsImageReferenced(path))
            images.TryDelete(path);
    }
}

// On startup, print the addresses the phone can use
app.Lifetime.ApplicationStarted.Register(() =>
{
    var port = app.Urls.Select(u => new Uri(u.Replace("*", "localhost").Replace("+", "localhost").Replace("0.0.0.0", "localhost")).Port).FirstOrDefault();
    var ips = System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces()
        .Where(n => n.OperationalStatus == System.Net.NetworkInformation.OperationalStatus.Up)
        .SelectMany(n => n.GetIPProperties().UnicastAddresses)
        .Where(a => a.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && !IPAddress.IsLoopback(a.Address))
        .Select(a => a.Address.ToString());
    Console.WriteLine();
    Console.WriteLine($"  Data folder: {dataDir}");
    Console.WriteLine($"  Open on this PC: http://localhost:{port}");
    foreach (var ip in ips) Console.WriteLine($"  Open on your phone (same Wi-Fi): http://{ip}:{port}");
    Console.WriteLine();
});

app.Run();
