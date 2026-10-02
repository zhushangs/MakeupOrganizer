namespace MakeupOrganizer.Api;

public class Swatch
{
    /// <summary>#RRGGBB</summary>
    public string? Hex { get; set; }
    /// <summary>Optional name for this pan (e.g. an eyeshadow shade name)</summary>
    public string? Label { get; set; }
}

public class Product
{
    public string Id { get; set; } = "";
    /// <summary>lipstick | lipgloss | eyeshadow | blush | highlight | base | other</summary>
    public string Category { get; set; } = "lipstick";
    public string Brand { get; set; } = "";
    public string Name { get; set; } = "";
    public string? ShadeName { get; set; }

    /// <summary>Local image path, e.g. /images/abc.jpg</summary>
    public string? ImagePath { get; set; }
    /// <summary>Swatch image scraped from the link, if any</summary>
    public string? SwatchImagePath { get; set; }
    public string? SourceUrl { get; set; }

    public string? Channel { get; set; }
    public decimal? Price { get; set; }
    public string? Currency { get; set; }

    public int GridRows { get; set; } = 1;
    public int GridCols { get; set; } = 1;
    /// <summary>Row-major order; length = GridRows * GridCols</summary>
    public List<Swatch> Swatches { get; set; } = new();

    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public record ScrapeRequest(string Url);

public class ScrapeResult
{
    public string SourceUrl { get; set; } = "";
    public string? Brand { get; set; }
    public string? Name { get; set; }
    public string? ShadeName { get; set; }
    public decimal? Price { get; set; }
    public string? Currency { get; set; }
    public string? Channel { get; set; }
    public string? ImagePath { get; set; }
    public string? SwatchImagePath { get; set; }
    /// <summary>Color value given directly by the page (rare)</summary>
    public string? ColorHex { get; set; }
    public List<string> Warnings { get; set; } = new();
}
