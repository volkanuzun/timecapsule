using Azure;
using Azure.Data.Tables;

namespace TimeCapsule.Api.Storage;

public sealed class MessageEntity : ITableEntity
{
    public string PartitionKey { get; set; } = Partition;
    public string RowKey { get; set; } = string.Empty;
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public string Title { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string? TextContent { get; set; }
    public string? MediaUrl { get; set; }
    public DateTimeOffset PublishAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public string Email { get; set; } = string.Empty;
    public bool Notified { get; set; }

    public const string Partition = "message";
}
