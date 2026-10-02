using System.Net;
using System.Text;

namespace MakeupOrganizer.Api;

/// <summary>抓取商品页面 → 解析 → 把图片下载到本地。</summary>
public class Scraper
{
    private const int MaxHtmlBytes = 8 * 1024 * 1024;
    private readonly IHttpClientFactory _http;
    private readonly ImageService _images;
    private readonly ILogger<Scraper> _log;

    public Scraper(IHttpClientFactory http, ImageService images, ILogger<Scraper> log)
    {
        _http = http;
        _images = images;
        _log = log;
    }

    public async Task<ScrapeResult> ScrapeAsync(string rawUrl, CancellationToken ct)
    {
        var result = new ScrapeResult();
        var url = ExtractUrl(rawUrl);
        if (url is null)
        {
            result.Warnings.Add("That doesn't look like a valid link");
            return result;
        }
        result.SourceUrl = url.ToString();
        result.Channel = ProductPageParser.ChannelFromHost(url.Host);

        string html;
        Uri finalUrl = url;
        try
        {
            var client = _http.CreateClient("scraper");
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.TryAddWithoutValidation("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
            using var res = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            finalUrl = res.RequestMessage?.RequestUri ?? url;
            if (!res.IsSuccessStatusCode)
            {
                result.Warnings.Add(res.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.TooManyRequests or HttpStatusCode.ServiceUnavailable
                    ? $"{result.Channel} blocked the automatic fetch ({(int)res.StatusCode}), probably bot protection. Please upload an image and fill in the details manually."
                    : $"Couldn't open the link ({(int)res.StatusCode})");
                return result;
            }
            html = await ReadLimitedAsync(res, ct);
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            result.Warnings.Add("The site timed out. Try again later or fill in manually.");
            return result;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Scrape failed {Url}", url);
            result.Warnings.Add("Couldn't open the link: " + ex.Message);
            return result;
        }

        var parsed = ProductPageParser.Parse(html, finalUrl);
        result.SourceUrl = finalUrl.ToString();
        result.Brand = parsed.Brand;
        result.Name = parsed.Name;
        result.ShadeName = parsed.ShadeName;
        result.Price = parsed.Price;
        result.Currency = parsed.Currency;
        result.Channel = parsed.Channel ?? result.Channel;
        result.ColorHex = parsed.ColorHex;

        // 两张图并行下载
        var imgTask = parsed.ImageUrl is null ? Task.FromResult<string?>(null) : _images.DownloadAsync(parsed.ImageUrl, finalUrl.ToString(), ct);
        var swTask = parsed.SwatchImageUrl is null ? Task.FromResult<string?>(null) : _images.DownloadAsync(parsed.SwatchImageUrl, finalUrl.ToString(), ct);
        result.ImagePath = await imgTask;
        result.SwatchImagePath = await swTask;

        if (result.Name is null && result.ImagePath is null)
            result.Warnings.Add("No product info found on this page. You may need to fill it in manually.");
        else if (result.ImagePath is null)
            result.Warnings.Add("Couldn't get a product image. You can upload one.");
        if (result.Price is null && result.Name is not null)
            result.Warnings.Add("No price found");

        return result;
    }

    /// <summary>手机“分享”出来的文本经常是 “商品名 https://...”，把链接挑出来。</summary>
    private static Uri? ExtractUrl(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var m = System.Text.RegularExpressions.Regex.Match(raw, @"https?://[^\s<>""']+");
        var s = m.Success ? m.Value : raw.Trim();
        if (!s.StartsWith("http")) s = "https://" + s;
        return Uri.TryCreate(s, UriKind.Absolute, out var u) && (u.Scheme == "http" || u.Scheme == "https") ? u : null;
    }

    private static async Task<string> ReadLimitedAsync(HttpResponseMessage res, CancellationToken ct)
    {
        await using var s = await res.Content.ReadAsStreamAsync(ct);
        using var ms = new MemoryStream();
        var buf = new byte[81920];
        int n;
        while ((n = await s.ReadAsync(buf, ct)) > 0 && ms.Length < MaxHtmlBytes)
            ms.Write(buf, 0, n);
        var charset = res.Content.Headers.ContentType?.CharSet;
        Encoding enc;
        try { enc = charset is null ? Encoding.UTF8 : Encoding.GetEncoding(charset.Trim('"')); }
        catch { enc = Encoding.UTF8; }
        return enc.GetString(ms.ToArray());
    }
}
