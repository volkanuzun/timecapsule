using System.Globalization;
using System.Text.Json;
using Azure.Data.Tables;
using Azure.Storage.Blobs;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Http.Features;
using TimeCapsule.Api.Models;
using TimeCapsule.Api.Services;
using TimeCapsule.Api.Storage;

var builder = WebApplication.CreateBuilder(args);
const long MaxAudioBytes = 50L * 1024 * 1024;
const long MaxUploadBytes = 55L * 1024 * 1024;

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

builder.Services.AddOpenApi();

builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection("Storage"));
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection("Email"));
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = MaxUploadBytes;
});

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = MaxUploadBytes;
});

builder.Services.AddSingleton(sp =>
{
    var options = sp.GetRequiredService<IOptions<StorageOptions>>().Value;
    return new BlobServiceClient(options.BlobConnectionString);
});

builder.Services.AddSingleton(sp =>
{
    var options = sp.GetRequiredService<IOptions<StorageOptions>>().Value;
    return new TableServiceClient(options.TableConnectionString);
});

builder.Services.AddSingleton<BlobStorageService>();
builder.Services.AddSingleton<IMessageRepository, TableMessageRepository>();
builder.Services.AddSingleton<StorageInitializer>();

builder.Services.AddSingleton<IEmailSender, AzureEmailSender>();
builder.Services.AddHostedService<NotificationWorker>();

var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? Array.Empty<string>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy =>
    {
        if (corsOrigins.Length == 0)
        {
            policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
        }
        else
        {
            policy.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod();
        }
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("frontend");
app.UseHttpsRedirection();

await app.Services.GetRequiredService<StorageInitializer>()
    .InitializeAsync(app.Lifetime.ApplicationStopping);

app.MapGet("/api/messages/public", async (IMessageRepository repository, CancellationToken cancellationToken) =>
{
    var now = DateTimeOffset.UtcNow;
    var messages = await repository.GetPublicAsync(now, cancellationToken);

    var response = messages.Select(entity =>
    {
        var parsed = Enum.TryParse<MessageType>(entity.Type, true, out var mappedType)
            ? mappedType
            : MessageType.Text;

        return new PublicMessage(
            entity.RowKey,
            entity.Title,
            parsed,
            entity.TextContent,
            entity.MediaUrl,
            entity.PublishAt,
            entity.CreatedAt);
    });

    return Results.Ok(response);
});

app.MapPost("/api/messages", async (
    HttpRequest request,
    IMessageRepository repository,
    BlobStorageService blobStorage,
    CancellationToken cancellationToken) =>
{
    if (!request.HasFormContentType)
    {
        return Results.BadRequest(new { error = "Expected multipart/form-data." });
    }

    var form = await request.ReadFormAsync(cancellationToken);
    var title = form["title"].ToString().Trim();
    var typeValue = form["type"].ToString().Trim();
    var publishAtValue = form["publishAt"].ToString().Trim();

    if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(typeValue) || string.IsNullOrWhiteSpace(publishAtValue))
    {
        return Results.BadRequest(new { error = "Title, type, and publishAt are required." });
    }

    if (!Enum.TryParse<MessageType>(typeValue, true, out var type))
    {
        return Results.BadRequest(new { error = "Type must be text, image, or audio." });
    }

    if (!DateTimeOffset.TryParse(publishAtValue, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var publishAt))
    {
        return Results.BadRequest(new { error = "publishAt must be a valid date time." });
    }

    var email = form["email"].ToString().Trim();
    var textContent = form["textContent"].ToString().Trim();
    var file = form.Files.GetFile("file");

    string? mediaUrl = null;

    if (type == MessageType.Text)
    {
        if (string.IsNullOrWhiteSpace(textContent))
        {
            return Results.BadRequest(new { error = "textContent is required for text messages." });
        }
    }
    else
    {
        if (file is null)
        {
            return Results.BadRequest(new { error = "file is required for image or audio messages." });
        }

        if (type == MessageType.Image && !file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            return Results.BadRequest(new { error = "file must be an image." });
        }

        if (type == MessageType.Audio && !file.ContentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase))
        {
            return Results.BadRequest(new { error = "file must be an audio file." });
        }

        if (type == MessageType.Audio && file.Length > MaxAudioBytes)
        {
            return Results.BadRequest(new { error = "Audio files must be 50MB or less." });
        }

        var extension = Path.GetExtension(file.FileName);
        var blobName = $"{type.ToString().ToLowerInvariant()}/{Guid.NewGuid():N}{extension}";
        mediaUrl = await blobStorage.UploadAsync(file, blobName, cancellationToken);
    }

    var entity = new MessageEntity
    {
        PartitionKey = MessageEntity.Partition,
        RowKey = Guid.NewGuid().ToString("N"),
        Title = title,
        Type = type.ToString(),
        TextContent = type == MessageType.Text ? textContent : null,
        MediaUrl = mediaUrl,
        PublishAt = publishAt,
        CreatedAt = DateTimeOffset.UtcNow,
        Email = string.IsNullOrWhiteSpace(email) ? string.Empty : email,
        Notified = false
    };

    await repository.AddAsync(entity, cancellationToken);

    return Results.Created($"/api/messages/{entity.RowKey}", new CreateMessageResult(entity.RowKey, entity.PublishAt));
});

app.Run();
