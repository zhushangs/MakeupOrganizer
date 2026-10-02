namespace MakeupOrganizer.Api;

public class Swatch
{
    /// <summary>#RRGGBB</summary>
    public string? Hex { get; set; }
    /// <summary>可选：这一格的名字（眼影每格的色名）</summary>
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

    /// <summary>本地图片路径，例如 /images/abc.jpg</summary>
    public string? ImagePath { get; set; }
    /// <summary>链接里抓到的色块小图（如果有）</summary>
    public string? SwatchImagePath { get; set; }
    public string? SourceUrl { get; set; }

    public string? Channel { get; set; }
    public decimal? Price { get; set; }
    public string? Currency { get; set; }

    public int GridRows { get; set; } = 1;
    public int GridCols { get; set; } = 1;
    /// <summary>按行排列，长度 = GridRows * GridCols</summary>
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
    /// <summary>页面里直接写了颜色值（少见）</summary>
    public string? ColorHex { get; set; }
    public List<string> Warnings { get; set; } = new();
}
