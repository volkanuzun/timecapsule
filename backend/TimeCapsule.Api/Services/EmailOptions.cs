namespace TimeCapsule.Api.Services;

public sealed class EmailOptions
{
    public string ConnectionString { get; set; } = string.Empty;
    public string Sender { get; set; } = string.Empty;
}
