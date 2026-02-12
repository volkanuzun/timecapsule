namespace TimeCapsule.Api.Storage;

public interface IMessageRepository
{
    Task AddAsync(MessageEntity entity, CancellationToken cancellationToken);
    Task<IReadOnlyList<MessageEntity>> GetPublicAsync(DateTimeOffset now, CancellationToken cancellationToken);
    Task<IReadOnlyList<MessageEntity>> GetDueForNotificationAsync(DateTimeOffset now, CancellationToken cancellationToken);
    Task MarkNotifiedAsync(MessageEntity entity, CancellationToken cancellationToken);
}
