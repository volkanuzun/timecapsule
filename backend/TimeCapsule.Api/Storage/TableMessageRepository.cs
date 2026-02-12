using Azure;
using Azure.Data.Tables;
using Microsoft.Extensions.Options;

namespace TimeCapsule.Api.Storage;

public sealed class TableMessageRepository : IMessageRepository
{
    private readonly TableClient _tableClient;
    private readonly SemaphoreSlim _tableGate = new(1, 1);
    private bool _initialized;

    public TableMessageRepository(TableServiceClient tableServiceClient, IOptions<StorageOptions> options)
    {
        _tableClient = tableServiceClient.GetTableClient(options.Value.TableName);
    }

    public async Task AddAsync(MessageEntity entity, CancellationToken cancellationToken)
    {
        await EnsureTableAsync(cancellationToken);
        await _tableClient.AddEntityAsync(entity, cancellationToken);
    }

    public async Task<IReadOnlyList<MessageEntity>> GetPublicAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        await EnsureTableAsync(cancellationToken);
        var filter = TableClient.CreateQueryFilter<MessageEntity>(
            entity => entity.PartitionKey == MessageEntity.Partition && entity.PublishAt <= now);

        var results = new List<MessageEntity>();
        await foreach (var entity in _tableClient.QueryAsync<MessageEntity>(filter, cancellationToken: cancellationToken))
        {
            results.Add(entity);
        }

        return results
            .OrderBy(entity => entity.PublishAt)
            .ToList();
    }

    public async Task<IReadOnlyList<MessageEntity>> GetDueForNotificationAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        await EnsureTableAsync(cancellationToken);
        var baseFilter = TableClient.CreateQueryFilter<MessageEntity>(
            entity => entity.PartitionKey == MessageEntity.Partition
                && entity.PublishAt <= now
                && entity.Notified == false);

        var filter = $"{baseFilter} and Email ne ''";
        var results = new List<MessageEntity>();
        await foreach (var entity in _tableClient.QueryAsync<MessageEntity>(filter, cancellationToken: cancellationToken))
        {
            results.Add(entity);
        }

        return results;
    }

    public async Task MarkNotifiedAsync(MessageEntity entity, CancellationToken cancellationToken)
    {
        await EnsureTableAsync(cancellationToken);
        entity.Notified = true;
        await _tableClient.UpdateEntityAsync(entity, entity.ETag, TableUpdateMode.Replace, cancellationToken);
    }

    private async Task EnsureTableAsync(CancellationToken cancellationToken)
    {
        if (_initialized)
        {
            return;
        }

        await _tableGate.WaitAsync(cancellationToken);
        try
        {
            if (_initialized)
            {
                return;
            }

            await _tableClient.CreateIfNotExistsAsync(cancellationToken);
            _initialized = true;
        }
        finally
        {
            _tableGate.Release();
        }
    }
}
