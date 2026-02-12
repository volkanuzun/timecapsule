namespace TimeCapsule.Api.Storage;

public sealed class StorageOptions
{
    public string BlobConnectionString { get; set; } = string.Empty;
    public string BlobContainer { get; set; } = "timecapsule-media";
    public string TableConnectionString { get; set; } = string.Empty;
    public string TableName { get; set; } = "TimeCapsuleMessages";
}
