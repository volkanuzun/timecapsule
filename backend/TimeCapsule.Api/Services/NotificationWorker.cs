using TimeCapsule.Api.Storage;

namespace TimeCapsule.Api.Services;

public sealed class NotificationWorker : BackgroundService
{
    private readonly IMessageRepository _repository;
    private readonly IEmailSender _emailSender;
    private readonly ILogger<NotificationWorker> _logger;
    private readonly TimeSpan _interval = TimeSpan.FromMinutes(1);

    public NotificationWorker(IMessageRepository repository, IEmailSender emailSender, ILogger<NotificationWorker> logger)
    {
        _repository = repository;
        _emailSender = emailSender;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var now = DateTimeOffset.UtcNow;
                var dueMessages = await _repository.GetDueForNotificationAsync(now, stoppingToken);

                foreach (var message in dueMessages)
                {
                    if (string.IsNullOrWhiteSpace(message.Email))
                    {
                        continue;
                    }

                    await _emailSender.SendMessagePublishedAsync(message.Email, message.Title, message.PublishAt, stoppingToken);
                    await _repository.MarkNotifiedAsync(message, stoppingToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed while processing notifications.");
            }

            await Task.Delay(_interval, stoppingToken);
        }
    }
}
