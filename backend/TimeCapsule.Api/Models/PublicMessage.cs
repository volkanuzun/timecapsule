namespace TimeCapsule.Api.Models;

public sealed record PublicMessage(
    string Id,
    string Title,
    MessageType Type,
    string? TextContent,
    string? MediaUrl,
    DateTimeOffset PublishAt,
    DateTimeOffset CreatedAt
);
