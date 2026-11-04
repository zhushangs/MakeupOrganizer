using System.Text.Json;

namespace MakeupOrganizer.Api;

/// <summary>
/// Personal-scale data, so a single JSON file is enough; no database needed.
/// Writes go to a temp file first and then replace the original, so a crash mid-write can't corrupt it.
/// </summary>
public class ProductStore
{
    private readonly string _file;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private List<Product> _items = new();

    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public ProductStore(string dataDir)
    {
        Directory.CreateDirectory(dataDir);
        _file = Path.Combine(dataDir, "products.json");
        if (File.Exists(_file))
        {
            var json = File.ReadAllText(_file);
            _items = JsonSerializer.Deserialize<List<Product>>(json, JsonOptions) ?? new();
        }
    }

    public async Task<List<Product>> GetAllAsync()
    {
        await _lock.WaitAsync();
        try { return _items.OrderByDescending(p => p.CreatedAt).ToList(); }
        finally { _lock.Release(); }
    }

    public async Task<Product?> GetAsync(string id)
    {
        await _lock.WaitAsync();
        try { return _items.FirstOrDefault(p => p.Id == id); }
        finally { _lock.Release(); }
    }

    public async Task<Product> AddAsync(Product p)
    {
        await _lock.WaitAsync();
        try
        {
            p.Id = Guid.NewGuid().ToString("N")[..12];
            p.CreatedAt = p.UpdatedAt = DateTimeOffset.UtcNow;
            Normalize(p);
            _items.Add(p);
            await SaveAsync();
            return p;
        }
        finally { _lock.Release(); }
    }

    public async Task<Product?> UpdateAsync(string id, Product incoming)
    {
        await _lock.WaitAsync();
        try
        {
            var idx = _items.FindIndex(p => p.Id == id);
            if (idx < 0) return null;
            incoming.Id = id;
            incoming.CreatedAt = _items[idx].CreatedAt;
            incoming.UpdatedAt = DateTimeOffset.UtcNow;
            Normalize(incoming);
            _items[idx] = incoming;
            await SaveAsync();
            return incoming;
        }
        finally { _lock.Release(); }
    }

    public async Task<Product?> DeleteAsync(string id)
    {
        await _lock.WaitAsync();
        try
        {
            var p = _items.FirstOrDefault(x => x.Id == id);
            if (p is null) return null;
            _items.Remove(p);
            await SaveAsync();
            return p;
        }
        finally { _lock.Release(); }
    }

    /// <summary>Whether any product still references this image (used to decide whether to delete it)</summary>
    public bool IsImageReferenced(string path) =>
        _items.Any(p => p.ImagePath == path);

    private static void Normalize(Product p)
    {
        p.GridRows = Math.Clamp(p.GridRows, 1, 12);
        p.GridCols = Math.Clamp(p.GridCols, 1, 12);
        p.Layout = ValidLayout(p.GridRows, p.GridCols, p.Layout);
        var n = p.Layout is null ? p.GridRows * p.GridCols : p.Layout.Max() + 1;
        p.Swatches ??= new();
        if (p.Swatches.Count > n) p.Swatches = p.Swatches.Take(n).ToList();
        while (p.Swatches.Count < n) p.Swatches.Add(new Swatch());
        foreach (var s in p.Swatches)
        {
            if (s.Hex is not null && !System.Text.RegularExpressions.Regex.IsMatch(s.Hex, "^#[0-9a-fA-F]{6}$"))
                s.Hex = null;
            s.Hex = s.Hex?.ToLowerInvariant();
        }
        foreach (var s in p.Swatches) s.Label = OptStr(s.Label);
        // same rules as normalizeProduct in worker/src/index.ts
        p.Category = string.IsNullOrWhiteSpace(p.Category) ? "other" : p.Category.Trim();
        p.Brand = p.Brand?.Trim() ?? "";
        p.Name = p.Name?.Trim() ?? "";
        p.ShadeName = OptStr(p.ShadeName);
        p.Channel = OptStr(p.Channel);
        p.Currency = OptStr(p.Currency);
        p.Notes = OptStr(p.Notes);
        // only our own stored pictures; anything else could point TryDelete at the wrong file
        if (p.ImagePath is not null && !ImagePathRe.IsMatch(p.ImagePath)) p.ImagePath = null;
    }

    private static readonly System.Text.RegularExpressions.Regex ImagePathRe = new(@"^/images/[\w.-]+$");

    private static string? OptStr(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    /// <summary>
    /// Keep a layout only if it's well-formed: right length, pans numbered 0..n-1 in reading order,
    /// and every pan a filled rectangle. Returns null for invalid layouts or one-pan-per-cell.
    /// </summary>
    private static List<int>? ValidLayout(int rows, int cols, List<int>? layout)
    {
        if (layout is null || layout.Count != rows * cols) return null;
        var next = 0;
        var seen = new Dictionary<int, (int r0, int c0, int r1, int c1, int count)>();
        for (var i = 0; i < layout.Count; i++)
        {
            var pan = layout[i];
            int r = i / cols, c = i % cols;
            if (!seen.TryGetValue(pan, out var b))
            {
                if (pan != next++) return null; // must be numbered in reading order
                seen[pan] = (r, c, r, c, 1);
            }
            else seen[pan] = (Math.Min(b.r0, r), Math.Min(b.c0, c), Math.Max(b.r1, r), Math.Max(b.c1, c), b.count + 1);
        }
        foreach (var b in seen.Values)
            if ((b.r1 - b.r0 + 1) * (b.c1 - b.c0 + 1) != b.count) return null; // not a rectangle
        return seen.Count == layout.Count ? null : layout;
    }

    private async Task SaveAsync()
    {
        var tmp = _file + ".tmp";
        await File.WriteAllTextAsync(tmp, JsonSerializer.Serialize(_items, JsonOptions));
        File.Move(tmp, _file, overwrite: true);
    }
}
