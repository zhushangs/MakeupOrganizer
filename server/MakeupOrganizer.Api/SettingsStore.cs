using System.Text.Json;
using System.Text.RegularExpressions;

namespace MakeupOrganizer.Api;

public class CategoryDef
{
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    /// <summary>Multi-pan by default (palettes)</summary>
    public bool Multi { get; set; }
    public int DefaultRows { get; set; } = 1;
    public int DefaultCols { get; set; } = 1;
}

/// <summary>User-editable lists: categories and extra brands (for autocomplete and screenshot import).</summary>
public class AppSettings
{
    public List<CategoryDef> Categories { get; set; } = new();
    public List<string> Brands { get; set; } = new();
}

/// <summary>Stored in data/settings.json; falls back to the built-in categories.</summary>
public class SettingsStore
{
    private readonly string _file;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private AppSettings _settings;

    public static List<CategoryDef> DefaultCategories() => new()
    {
        new() { Key = "lipstick", Label = "Lipstick" },
        new() { Key = "lipgloss", Label = "Lip Gloss" },
        new() { Key = "eyeshadow", Label = "Eyeshadow", Multi = true, DefaultRows = 3, DefaultCols = 3 },
        new() { Key = "blush", Label = "Blush" },
        new() { Key = "highlight", Label = "Highlight & Contour" },
        new() { Key = "base", Label = "Base" },
        new() { Key = "other", Label = "Other" },
    };

    public SettingsStore(string dataDir)
    {
        Directory.CreateDirectory(dataDir);
        _file = Path.Combine(dataDir, "settings.json");
        _settings = File.Exists(_file)
            ? JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(_file), ProductStore.JsonOptions) ?? new()
            : new();
        Normalize(_settings);
    }

    public async Task<AppSettings> GetAsync()
    {
        await _lock.WaitAsync();
        try { return Clone(_settings); }
        finally { _lock.Release(); }
    }

    public async Task<AppSettings> SaveAsync(AppSettings incoming)
    {
        Normalize(incoming);
        await _lock.WaitAsync();
        try
        {
            _settings = incoming;
            var tmp = _file + ".tmp";
            await File.WriteAllTextAsync(tmp, JsonSerializer.Serialize(_settings, ProductStore.JsonOptions));
            File.Move(tmp, _file, overwrite: true);
            return Clone(_settings);
        }
        finally { _lock.Release(); }
    }

    private static void Normalize(AppSettings s)
    {
        s.Categories ??= new();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        s.Categories = s.Categories
            .Where(c => !string.IsNullOrWhiteSpace(c.Label))
            .Select(c =>
            {
                c.Label = c.Label.Trim();
                c.Key = string.IsNullOrWhiteSpace(c.Key) ? Slug(c.Label) : c.Key.Trim();
                c.DefaultRows = Math.Clamp(c.DefaultRows, 1, 10);
                c.DefaultCols = Math.Clamp(c.DefaultCols, 1, 10);
                if (!c.Multi) c.DefaultRows = c.DefaultCols = 1;
                return c;
            })
            .Where(c => c.Key != "all" && seen.Add(c.Key))
            .ToList();
        if (s.Categories.Count == 0) s.Categories = DefaultCategories();
        // "other" is the fallback for anything uncategorized, so it always exists
        if (!s.Categories.Any(c => c.Key == "other")) s.Categories.Add(new CategoryDef { Key = "other", Label = "Other" });

        s.Brands = (s.Brands ?? new())
            .Select(b => b?.Trim() ?? "")
            .Where(b => b.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(b => b, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string Slug(string label)
    {
        var s = Regex.Replace(label.ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
        return s.Length > 0 ? s : "c" + Guid.NewGuid().ToString("N")[..8];
    }

    private static AppSettings Clone(AppSettings s) =>
        JsonSerializer.Deserialize<AppSettings>(JsonSerializer.Serialize(s, ProductStore.JsonOptions), ProductStore.JsonOptions)!;
}
