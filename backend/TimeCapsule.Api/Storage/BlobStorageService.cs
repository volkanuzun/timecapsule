using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Options;

namespace TimeCapsule.Api.Storage;

public sealed class BlobStorageService
{
    private readonly BlobContainerClient _containerClient;
    private readonly SemaphoreSlim _containerGate = new(1, 1);
    private bool _initialized;

    public BlobStorageService(BlobServiceClient blobServiceClient, IOptions<StorageOptions> options)
    {
        _containerClient = blobServiceClient.GetBlobContainerClient(options.Value.BlobContainer);
    }

    public async Task<string> UploadAsync(IFormFile file, string blobName, CancellationToken cancellationToken)
    {
        await EnsureContainerAsync(cancellationToken);

        var blobClient = _containerClient.GetBlobClient(blobName);
        await using var stream = file.OpenReadStream();
        await blobClient.UploadAsync(
            stream,
            new BlobHttpHeaders { ContentType = file.ContentType },
            cancellationToken: cancellationToken);

        return blobClient.Uri.ToString();
    }

    private async Task EnsureContainerAsync(CancellationToken cancellationToken)
    {
        if (_initialized)
        {
            return;
        }

        await _containerGate.WaitAsync(cancellationToken);
        try
        {
            if (_initialized)
            {
                return;
            }

            await _containerClient.CreateIfNotExistsAsync(PublicAccessType.Blob, cancellationToken: cancellationToken);
            _initialized = true;
        }
        finally
        {
            _containerGate.Release();
        }
    }
}
