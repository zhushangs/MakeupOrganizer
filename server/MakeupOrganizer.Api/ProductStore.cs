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
        p.GridRows = Math.Clamp(p.GridRows, 1, 10);
        p.GridCols = Math.Clamp(p.GridCols, 1, 10);
        var n = p.GridRows * p.GridCols;
        p.Swatches ??= new();
        if (p.Swatches.Count > n) p.Swatches = p.Swatches.Take(n).ToList();
        while (p.Swatches.Count < n) p.Swatches.Add(new Swatch());
        foreach (var s in p.Swatches)
        {
            if (s.Hex is not null && !System.Text.RegularExpressions.Regex.IsMatch(s.Hex, "^#[0-9a-fA-F]{6}$"))
                s.Hex = null;
            s.Hex = s.Hex?.ToLowerInvariant();
        }
        p.Brand = p.Brand?.Trim() ?? "";
        p.Name = p.Name?.Trim() ?? "";
        p.ShadeName = string.IsNullOrWhiteSpace(p.ShadeName) ? null : p.ShadeName.Trim();
        p.Channel = string.IsNullOrWhiteSpace(p.Channel) ? null : p.Channel.Trim();
    }

    private async Task SaveAsync()
    {
        var tmp = _file + ".tmp";
        await File.WriteAllTextAsync(tmp, JsonSerializer.Serialize(_items, JsonOptions));
        File.Move(tmp, _file, overwrite: true);
    }
}
