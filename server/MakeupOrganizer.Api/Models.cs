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

    /// <summary>Where it was bought (Sephora, Ulta, ...)</summary>
    public string? Channel { get; set; }
    /// <summary>Retail / list price</summary>
    public decimal? OriginalPrice { get; set; }
    /// <summary>What was actually paid</summary>
    public decimal? PaidPrice { get; set; }
    public string? Currency { get; set; }

    public int GridRows { get; set; } = 1;
    public int GridCols { get; set; } = 1;
    /// <summary>
    /// Optional: which pan each grid cell belongs to (row-major, length GridRows * GridCols), so a pan can
    /// span several cells. Pans are numbered 0..n-1 in reading order. Null = one pan per cell.
    /// </summary>
    public List<int>? Layout { get; set; }
    /// <summary>One per pan, in reading order</summary>
    public List<Swatch> Swatches { get; set; } = new();

    /// <summary>Free-form notes / how it wears</summary>
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public record ImageSearchRequest(string Query);

public class ImageSearchHit
{
    public string ImageUrl { get; set; } = "";
    public string? ThumbnailUrl { get; set; }
    public string? Title { get; set; }
    public string? Source { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
}

/// <summary>Save a web image locally. FallbackUrl (usually the search thumbnail) is tried if Url fails.</summary>
public record ImageFromUrlRequest(string Url, string? FallbackUrl);
