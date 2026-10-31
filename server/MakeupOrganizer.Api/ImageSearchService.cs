using System.Text.Json;

namespace MakeupOrganizer.Api;

/// <summary>
/// Image search through Serper.dev (Google Images results).
/// The API key is read from configuration "Serper:ApiKey" (put it in appsettings.Local.json,
/// which is git-ignored) or the SERPER_API_KEY environment variable.
/// </summary>
public class ImageSearchService
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _config;
    private readonly ILogger<ImageSearchService> _log;

    public ImageSearchService(IHttpClientFactory http, IConfiguration config, ILogger<ImageSearchService> log)
    {
        _http = http;
        _config = config;
        _log = log;
    }

    private string? ApiKey =>
        _config["Serper:ApiKey"] is { Length: > 0 } k ? k :
        Environment.GetEnvironmentVariable("SERPER_API_KEY") is { Length: > 0 } e ? e : null;

    private string BaseUrl => _config["Serper:BaseUrl"] is { Length: > 0 } u ? u.TrimEnd('/') : "https://google.serper.dev";

    public bool IsConfigured => ApiKey is not null;

    public async Task<List<ImageSearchHit>> SearchAsync(string query, CancellationToken ct)
    {
        var key = ApiKey ?? throw new ImageSearchException(
            "Image search isn't set up yet. Add your Serper API key to appsettings.Local.json (see README).");

        var client = _http.CreateClient("web");
        using var req = new HttpRequestMessage(HttpMethod.Post, BaseUrl + "/images")
        {
            // Buffered (not chunked) body with an explicit Content-Length
            Content = new StringContent(JsonSerializer.Serialize(new { q = query, num = 20 }), System.Text.Encoding.UTF8, "application/json")
        };
        req.Headers.Add("X-API-KEY", key);

        using var res = await client.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode)
        {
            var body = await res.Content.ReadAsStringAsync(ct);
            _log.LogWarning("Serper returned {Status}: {Body}", (int)res.StatusCode, body);
            throw new ImageSearchException((int)res.StatusCode switch
            {
                401 or 403 => "The Serper API key was rejected. Check the key in appsettings.Local.json.",
                429 => "Serper rate limit or free credits used up.",
                _ => $"Image search failed ({(int)res.StatusCode})."
            });
        }

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStreamAsync(ct));
        var hits = new List<ImageSearchHit>();
        if (doc.RootElement.TryGetProperty("images", out var images) && images.ValueKind == JsonValueKind.Array)
        {
            foreach (var im in images.EnumerateArray())
            {
                var url = Str(im, "imageUrl");
                if (url is null || !url.StartsWith("http")) continue;
                hits.Add(new ImageSearchHit
                {
                    ImageUrl = url,
                    ThumbnailUrl = Str(im, "thumbnailUrl"),
                    Title = Str(im, "title"),
                    Source = Str(im, "source") ?? Str(im, "domain"),
                    Width = Int(im, "imageWidth"),
                    Height = Int(im, "imageHeight"),
                });
            }
        }
        return hits;
    }

    private static string? Str(JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static int? Int(JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i) ? i : null;
}

public class ImageSearchException(string message) : Exception(message);
