namespace TimeCapsule.Api.Models;

public sealed record CreateMessageResult(
    string Id,
    DateTimeOffset PublishAt
);
