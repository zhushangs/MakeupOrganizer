using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace MakeupOrganizer.Api;

/// <summary>
/// 纯解析：输入 HTML + 页面地址，输出商品信息和图片地址（还没下载）。
/// 按可靠程度依次尝试：
///   1. Sephora 页面内嵌的 linkStore JSON（有当前色号、价格）
///   2. schema.org Product 的 JSON-LD（Ulta、大部分品牌官网、百货店都有）
///   3. og:/product: meta 标签
///   4. &lt;title&gt;
/// </summary>
public static class ProductPageParser
{
    public class Parsed
    {
        public string? Brand, Name, ShadeName, Currency, Channel, ColorHex;
        public decimal? Price;
        public string? ImageUrl, SwatchImageUrl;
    }

    private static readonly JsonDocumentOptions JsonOpts = new()
    {
        AllowTrailingCommas = true,
        CommentHandling = JsonCommentHandling.Skip,
        MaxDepth = 256
    };

    public static Parsed Parse(string html, Uri pageUrl)
    {
        var r = new Parsed { Channel = ChannelFromHost(pageUrl.Host) };
        var skuFromUrl = SkuFromUrl(pageUrl);

        // 1. Sephora linkStore
        if (pageUrl.Host.Contains("sephora", StringComparison.OrdinalIgnoreCase))
            ParseSephoraLinkStore(html, r);

        // 2. JSON-LD
        ParseJsonLd(html, skuFromUrl, r);

        // 3. meta
        var meta = ParseMeta(html);
        r.Name ??= Get(meta, "og:title", "twitter:title");
        r.ImageUrl ??= Get(meta, "og:image", "og:image:secure_url", "twitter:image", "image");
        r.Brand ??= Get(meta, "product:brand", "og:brand", "brand");
        r.Price ??= ParsePrice(Get(meta, "product:price:amount", "og:price:amount", "price"));
        r.Currency ??= Get(meta, "product:price:currency", "og:price:currency", "pricecurrency");
        r.ShadeName ??= Get(meta, "product:color");
        if (Get(meta, "og:site_name") is { } site && r.Channel == HostOnly(pageUrl.Host)) r.Channel = site;

        // 4. title
        if (r.Name is null)
        {
            var m = Regex.Match(html, @"<title[^>]*>(.*?)</title>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
            if (m.Success) r.Name = Clean(m.Groups[1].Value);
        }

        // 收尾清理
        r.Name = CleanTitle(r.Name, r.Channel);
        if (r.Brand is not null && r.Name is not null && r.Name.StartsWith(r.Brand + " ", StringComparison.OrdinalIgnoreCase))
            r.Name = r.Name[(r.Brand.Length + 1)..].Trim(' ', '-', '|');
        if (r.ShadeName is not null && r.Name is not null)
        {
            // “Matte Lipstick - Ruby Woo” 这种把色号拼在名字里的，拆掉
            foreach (var sep in new[] { " - ", " – ", " | ", ", " })
            {
                var suffix = sep + r.ShadeName;
                if (r.Name.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                    r.Name = r.Name[..^suffix.Length].Trim();
            }
        }
        if (r.Price is not null && r.Currency is null && html.Contains("$")) r.Currency = "USD";

        r.ImageUrl = Absolute(r.ImageUrl, pageUrl);
        r.SwatchImageUrl = Absolute(r.SwatchImageUrl, pageUrl);

        // Sephora 的色块图有固定规律：/productimages/sku/s{skuId}+sw.jpg
        if (r.SwatchImageUrl is null && pageUrl.Host.Contains("sephora", StringComparison.OrdinalIgnoreCase) && skuFromUrl is not null)
            r.SwatchImageUrl = $"https://www.sephora.com/productimages/sku/s{skuFromUrl}+sw.jpg";

        return r;
    }

    // ---------------- Sephora ----------------

    private static void ParseSephoraLinkStore(string html, Parsed r)
    {
        var m = Regex.Match(html, @"<script[^>]*id=[""']linkStore[""'][^>]*>(.*?)</script>",
            RegexOptions.Singleline | RegexOptions.IgnoreCase);
        if (!m.Success) return;
        try
        {
            using var doc = JsonDocument.Parse(m.Groups[1].Value, JsonOpts);
            if (FindProperty(doc.RootElement, "currentSku") is { ValueKind: JsonValueKind.Object } sku)
            {
                r.ShadeName ??= Str(sku, "variationValue") ?? Str(sku, "variationDesc");
                r.Price ??= ParsePrice(Str(sku, "salePrice")) ?? ParsePrice(Str(sku, "listPrice"));
                if (sku.TryGetProperty("skuImages", out var imgs) && imgs.ValueKind == JsonValueKind.Object)
                    r.ImageUrl ??= Str(imgs, "imageUrl") ?? Str(imgs, "image450") ?? Str(imgs, "image250");
                r.SwatchImageUrl ??= Str(sku, "smallImage");
            }
            if (FindProperty(doc.RootElement, "productDetails") is { ValueKind: JsonValueKind.Object } pd)
            {
                r.Name ??= Str(pd, "displayName");
                if (pd.TryGetProperty("brand", out var b)) r.Brand ??= BrandName(b);
            }
        }
        catch (JsonException) { /* 页面结构变了就跳过 */ }
    }

    // ---------------- JSON-LD ----------------

    private static void ParseJsonLd(string html, string? sku, Parsed r)
    {
        var products = new List<JsonElement>();
        var docs = new List<JsonDocument>();
        try
        {
            foreach (Match m in Regex.Matches(html,
                         @"<script[^>]*type=[""']application/ld\+json[""'][^>]*>(.*?)</script>",
                         RegexOptions.Singleline | RegexOptions.IgnoreCase))
            {
                try
                {
                    var doc = JsonDocument.Parse(WebUtility.HtmlDecode(m.Groups[1].Value.Trim()), JsonOpts);
                    docs.Add(doc);
                    CollectProducts(doc.RootElement, products);
                }
                catch (JsonException) { }
            }
            if (products.Count == 0) return;

            // 优先：有 offers 的 Product；如果是 ProductGroup，找和 URL 里 sku 对应的变体
            JsonElement? group = products.FirstOrDefault(p => HasType(p, "ProductGroup")) is { ValueKind: JsonValueKind.Object } g ? g : null;
            JsonElement main = products.FirstOrDefault(p => HasType(p, "Product") && p.TryGetProperty("offers", out _));
            if (main.ValueKind != JsonValueKind.Object) main = products[0];

            JsonElement? variant = null;
            var candidates = new List<JsonElement>();
            if (group is { } gg && gg.TryGetProperty("hasVariant", out var hv) && hv.ValueKind == JsonValueKind.Array)
                candidates.AddRange(hv.EnumerateArray().Where(v => v.ValueKind == JsonValueKind.Object));
            candidates.AddRange(products.Where(p => HasType(p, "Product")));
            if (sku is not null)
            {
                variant = candidates.FirstOrDefault(v =>
                    Str(v, "sku") == sku || Str(v, "productID") == sku || Str(v, "gtin13") == sku ||
                    (Str(v, "url")?.Contains(sku) ?? false) ||
                    (OfferField(v, "sku") == sku) || (OfferField(v, "url")?.Contains(sku) ?? false));
                if (variant is { ValueKind: JsonValueKind.Undefined }) variant = null;
            }

            var pick = variant ?? main;
            var groupName = group is { } gx ? Str(gx, "name") : null;

            r.Name ??= groupName ?? Str(pick, "name");
            r.Brand ??= pick.TryGetProperty("brand", out var b) ? BrandName(b)
                      : group is { } g2 && g2.TryGetProperty("brand", out var b2) ? BrandName(b2) : null;

            var color = Str(pick, "color");
            if (color is not null && Regex.IsMatch(color, "^#?[0-9a-fA-F]{6}$"))
                r.ColorHex = "#" + color.TrimStart('#').ToLowerInvariant();
            else
                r.ShadeName ??= color;

            // 变体名字通常是 “产品名 - 色号”
            if (r.ShadeName is null && variant is { } vv && Str(vv, "name") is { } vn && groupName is not null && vn != groupName)
            {
                var rest = vn.StartsWith(groupName) ? vn[groupName.Length..] : vn;
                rest = rest.Trim(' ', '-', '–', ',', '|');
                if (rest.Length > 0) r.ShadeName = rest;
            }

            r.ImageUrl ??= ImageFrom(pick) ?? (group is { } g3 ? ImageFrom(g3) : null);

            var (price, cur) = PriceFrom(pick);
            if (price is null && group is { } g4) (price, cur) = PriceFrom(g4);
            r.Price ??= price;
            r.Currency ??= cur;
        }
        finally
        {
            foreach (var d in docs) d.Dispose();
        }
    }

    private static void CollectProducts(JsonElement el, List<JsonElement> found)
    {
        switch (el.ValueKind)
        {
            case JsonValueKind.Object:
                if (HasType(el, "Product") || HasType(el, "ProductGroup")) found.Add(el);
                foreach (var p in el.EnumerateObject())
                    if (p.Name != "hasVariant") CollectProducts(p.Value, found);
                break;
            case JsonValueKind.Array:
                foreach (var x in el.EnumerateArray()) CollectProducts(x, found);
                break;
        }
    }

    private static bool HasType(JsonElement el, string type)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty("@type", out var t)) return false;
        bool Match(string? s) => s is not null &&
            (s.Equals(type, StringComparison.OrdinalIgnoreCase) || s.EndsWith("/" + type, StringComparison.OrdinalIgnoreCase));
        return t.ValueKind switch
        {
            JsonValueKind.String => Match(t.GetString()),
            JsonValueKind.Array => t.EnumerateArray().Any(x => x.ValueKind == JsonValueKind.String && Match(x.GetString())),
            _ => false
        };
    }

    private static string? ImageFrom(JsonElement el)
    {
        if (!el.TryGetProperty("image", out var img)) return null;
        return ImageValue(img);
    }

    private static string? ImageValue(JsonElement img) => img.ValueKind switch
    {
        JsonValueKind.String => img.GetString(),
        JsonValueKind.Array => img.EnumerateArray().Select(ImageValue).FirstOrDefault(x => !string.IsNullOrEmpty(x)),
        JsonValueKind.Object => Str(img, "url") ?? Str(img, "contentUrl"),
        _ => null
    };

    private static (decimal?, string?) PriceFrom(JsonElement el)
    {
        if (!el.TryGetProperty("offers", out var offers)) return (null, null);
        return OfferPrice(offers);
    }

    private static (decimal?, string?) OfferPrice(JsonElement o)
    {
        if (o.ValueKind == JsonValueKind.Array)
        {
            foreach (var x in o.EnumerateArray())
            {
                var r = OfferPrice(x);
                if (r.Item1 is not null) return r;
            }
            return (null, null);
        }
        if (o.ValueKind != JsonValueKind.Object) return (null, null);
        var cur = Str(o, "priceCurrency");
        var price = ParsePrice(Str(o, "price")) ?? ParsePrice(Str(o, "lowPrice"));
        if (price is null && o.TryGetProperty("priceSpecification", out var ps))
        {
            var r = OfferPrice(ps);
            price = r.Item1; cur ??= r.Item2;
        }
        if (price is null && o.TryGetProperty("offers", out var inner))
        {
            var r = OfferPrice(inner);
            price = r.Item1; cur ??= r.Item2;
        }
        return (price, cur);
    }

    private static string? OfferField(JsonElement el, string name)
    {
        if (!el.TryGetProperty("offers", out var o)) return null;
        if (o.ValueKind == JsonValueKind.Object) return Str(o, name);
        if (o.ValueKind == JsonValueKind.Array)
            return o.EnumerateArray().Select(x => Str(x, name)).FirstOrDefault(x => x is not null);
        return null;
    }

    private static string? BrandName(JsonElement b) => b.ValueKind switch
    {
        JsonValueKind.String => Clean(b.GetString()),
        JsonValueKind.Object => Clean(Str(b, "name") ?? Str(b, "displayName")),
        JsonValueKind.Array => b.EnumerateArray().Select(BrandName).FirstOrDefault(x => x is not null),
        _ => null
    };

    // ---------------- meta ----------------

    private static Dictionary<string, string> ParseMeta(string html)
    {
        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match m in Regex.Matches(html, @"<meta\b[^>]*>", RegexOptions.IgnoreCase))
        {
            string? key = null, content = null;
            foreach (Match a in Regex.Matches(m.Value, @"([a-zA-Z_:\-]+)\s*=\s*(?:""([^""]*)""|'([^']*)')"))
            {
                var name = a.Groups[1].Value.ToLowerInvariant();
                var val = a.Groups[2].Success ? a.Groups[2].Value : a.Groups[3].Value;
                if (name is "property" or "name" or "itemprop") key ??= val;
                else if (name == "content") content = val;
            }
            if (key is not null && content is not null && !dict.ContainsKey(key))
                dict[key] = Clean(content) ?? "";
        }
        return dict;
    }

    private static string? Get(Dictionary<string, string> d, params string[] keys)
    {
        foreach (var k in keys)
            if (d.TryGetValue(k, out var v) && !string.IsNullOrWhiteSpace(v)) return v;
        return null;
    }

    // ---------------- helpers ----------------

    private static JsonElement? FindProperty(JsonElement el, string name, int depth = 0)
    {
        if (depth > 40) return null;
        if (el.ValueKind == JsonValueKind.Object)
        {
            foreach (var p in el.EnumerateObject())
                if (p.Name == name) return p.Value;
            foreach (var p in el.EnumerateObject())
                if (FindProperty(p.Value, name, depth + 1) is { } f) return f;
        }
        else if (el.ValueKind == JsonValueKind.Array)
        {
            foreach (var x in el.EnumerateArray())
                if (FindProperty(x, name, depth + 1) is { } f) return f;
        }
        return null;
    }

    private static string? Str(JsonElement el, string name)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(name, out var v)) return null;
        return v.ValueKind switch
        {
            JsonValueKind.String => Clean(v.GetString()),
            JsonValueKind.Number => v.GetRawText(),
            _ => null
        };
    }

    public static decimal? ParsePrice(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var m = Regex.Match(s, @"\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?");
        if (!m.Success) return null;
        return decimal.TryParse(m.Value.Replace(",", ""), NumberStyles.Number, CultureInfo.InvariantCulture, out var d) && d > 0 ? d : null;
    }

    private static string? Clean(string? s)
    {
        if (s is null) return null;
        s = WebUtility.HtmlDecode(s);
        s = Regex.Replace(s, @"<[^>]+>", "");
        s = Regex.Replace(s, @"\s+", " ").Trim();
        return s.Length == 0 ? null : s;
    }

    private static string? CleanTitle(string? title, string? channel)
    {
        if (title is null) return null;
        // 去掉 “ | Sephora”、“ - Ulta Beauty” 这类后缀
        var parts = Regex.Split(title, @"\s+\|\s+");
        title = parts[0];
        if (channel is not null)
        {
            foreach (var sep in new[] { " - ", " – ", " at " })
            {
                var suf = sep + channel;
                var i = title.IndexOf(suf, StringComparison.OrdinalIgnoreCase);
                if (i > 0) title = title[..i];
            }
        }
        return title.Trim();
    }

    private static string? Absolute(string? url, Uri page)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        url = WebUtility.HtmlDecode(url.Trim());
        if (url.StartsWith("//")) url = page.Scheme + ":" + url;
        return Uri.TryCreate(page, url, out var abs) && (abs.Scheme == "http" || abs.Scheme == "https") ? abs.ToString() : null;
    }

    private static string? SkuFromUrl(Uri u)
    {
        var q = System.Web.HttpUtility.ParseQueryString(u.Query);
        foreach (var k in new[] { "skuId", "sku", "skuid", "variant", "color", "shade" })
            if (q[k] is { Length: > 0 } v) return v;
        return null;
    }

    private static string HostOnly(string host) => host.StartsWith("www.") ? host[4..] : host;

    public static string ChannelFromHost(string host)
    {
        var h = host.ToLowerInvariant();
        (string key, string name)[] known =
        {
            ("sephora", "Sephora"), ("ulta", "Ulta"), ("nordstrom", "Nordstrom"), ("macys", "Macy's"),
            ("bloomingdales", "Bloomingdale's"), ("saksfifthavenue", "Saks Fifth Avenue"), ("neimanmarcus", "Neiman Marcus"),
            ("bergdorfgoodman", "Bergdorf Goodman"), ("dillards", "Dillard's"), ("target", "Target"), ("amazon", "Amazon"),
            ("maccosmetics", "MAC Official"), ("diorbeauty", "Dior Official"), ("dior.com", "Dior Official"), ("chanel", "Chanel Official"),
            ("ysl", "YSL Official"), ("esteelauder", "Estée Lauder Official"), ("narscosmetics", "NARS Official"), ("charlottetilbury", "Charlotte Tilbury Official"),
            ("hourglasscosmetics", "Hourglass Official"), ("fentybeauty", "Fenty Beauty Official"), ("rarebeauty", "Rare Beauty Official"),
            ("toofaced", "Too Faced Official"), ("urbandecay", "Urban Decay Official"), ("anastasiabeverlyhills", "ABH Official"),
            ("tomford", "Tom Ford Official"), ("armanibeauty", "Armani Beauty Official"), ("lancome", "Lancôme Official"),
            ("clinique", "Clinique Official"), ("bobbibrown", "Bobbi Brown Official"), ("shiseido", "Shiseido Official"),
            ("patmcgrath", "Pat McGrath Official"), ("hudabeauty", "Huda Beauty Official"),
        };
        foreach (var (key, name) in known)
            if (h.Contains(key)) return name;
        return HostOnly(h);
    }
}
