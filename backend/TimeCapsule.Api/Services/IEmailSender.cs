namespace TimeCapsule.Api.Services;

public interface IEmailSender
{
    Task SendMessagePublishedAsync(string to, string title, DateTimeOffset publishAt, CancellationToken cancellationToken);
}
