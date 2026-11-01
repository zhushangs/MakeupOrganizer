namespace MakeupOrganizer.Api;

/// <summary>Images are stored under data/images and served at /images/{file name}.</summary>
public class ImageService
{
    public const long MaxBytes = 15 * 1024 * 1024;
    private readonly string _dir;
    private readonly IHttpClientFactory _http;
    private readonly ILogger<ImageService> _log;

    private static readonly Dictionary<string, string> ExtByType = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = ".jpg",
        ["image/jpg"] = ".jpg",
        ["image/png"] = ".png",
        ["image/webp"] = ".webp",
        ["image/gif"] = ".gif",
        ["image/avif"] = ".avif",
    };

    /// <summary>Static-file content types for every image format we save</summary>
    public static readonly Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider ContentTypes = CreateContentTypes();

    private static Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider CreateContentTypes()
    {
        var p = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
        p.Mappings[".avif"] = "image/avif";
        p.Mappings[".webp"] = "image/webp";
        return p;
    }

    public ImageService(string dataDir, IHttpClientFactory http, ILogger<ImageService> log)
    {
        _dir = Path.Combine(dataDir, "images");
        Directory.CreateDirectory(_dir);
        _http = http;
        _log = log;
    }

    public string ImagesDir => _dir;

    public async Task<string?> SaveAsync(Stream content, string? contentType, CancellationToken ct = default)
    {
        var ext = contentType is not null && ExtByType.TryGetValue(contentType.Split(';')[0].Trim(), out var e) ? e : null;
        if (ext is null) return null;
        var name = Guid.NewGuid().ToString("N") + ext;
        var full = Path.Combine(_dir, name);
        try
        {
            await using var fs = File.Create(full);
            await CopyLimitedAsync(content, fs, ct);
        }
        catch
        {
            // don't leave a half-written file behind (too large, cancelled, network error)
            try { File.Delete(full); } catch { /* ignore */ }
            throw;
        }
        return "/images/" + name;
    }

    /// <summary>Download a remote image locally; returns null on failure (never throws).</summary>
    public async Task<string?> DownloadAsync(string url, string? referer, CancellationToken ct = default)
    {
        try
        {
            var client = _http.CreateClient("web");
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            // Ask for widely supported formats first (sites that convert on the fly would otherwise send AVIF)
            req.Headers.TryAddWithoutValidation("Accept", "image/jpeg,image/png,image/webp;q=0.9,image/*;q=0.5");
            if (referer is not null) req.Headers.Referrer = new Uri(referer);
            using var res = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!res.IsSuccessStatusCode) return null;
            var type = res.Content.Headers.ContentType?.MediaType;
            if (type is null || !type.StartsWith("image/")) return null;
            await using var s = await res.Content.ReadAsStreamAsync(ct);
            return await SaveAsync(s, type, ct);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Image download failed {Url}", url);
            return null;
        }
    }

    public void TryDelete(string? path)
    {
        if (string.IsNullOrEmpty(path) || !path.StartsWith("/images/")) return;
        var name = Path.GetFileName(path);
        var full = Path.Combine(_dir, name);
        try { if (File.Exists(full)) File.Delete(full); } catch { /* ignore */ }
    }

    private static async Task CopyLimitedAsync(Stream src, Stream dst, CancellationToken ct)
    {
        var buf = new byte[81920];
        long total = 0;
        int n;
        while ((n = await src.ReadAsync(buf, ct)) > 0)
        {
            total += n;
            if (total > MaxBytes) throw new ImageTooLargeException();
            await dst.WriteAsync(buf.AsMemory(0, n), ct);
        }
    }
}

public class ImageTooLargeException() : Exception("Image is too large (over 15MB)");
