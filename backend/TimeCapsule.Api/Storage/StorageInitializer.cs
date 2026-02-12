using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Data.Tables;
using Microsoft.Extensions.Options;

namespace TimeCapsule.Api.Storage;

public sealed class StorageInitializer
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly TableServiceClient _tableServiceClient;
    private readonly StorageOptions _options;

    public StorageInitializer(
        BlobServiceClient blobServiceClient,
        TableServiceClient tableServiceClient,
        IOptions<StorageOptions> options)
    {
        _blobServiceClient = blobServiceClient;
        _tableServiceClient = tableServiceClient;
        _options = options.Value;
    }

    public async Task InitializeAsync(CancellationToken cancellationToken)
    {
        var containerClient = _blobServiceClient.GetBlobContainerClient(_options.BlobContainer);
        await containerClient.CreateIfNotExistsAsync(PublicAccessType.Blob, cancellationToken: cancellationToken);

        var tableClient = _tableServiceClient.GetTableClient(_options.TableName);
        await tableClient.CreateIfNotExistsAsync(cancellationToken);
    }
}
