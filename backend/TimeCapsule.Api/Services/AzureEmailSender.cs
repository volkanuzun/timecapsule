using Azure.Communication.Email;
using Microsoft.Extensions.Options;

namespace TimeCapsule.Api.Services;

public sealed class AzureEmailSender : IEmailSender
{
    private readonly EmailOptions _options;
    private readonly ILogger<AzureEmailSender> _logger;

    public AzureEmailSender(IOptions<EmailOptions> options, ILogger<AzureEmailSender> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task SendMessagePublishedAsync(string to, string title, DateTimeOffset publishAt, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_options.ConnectionString) || string.IsNullOrWhiteSpace(_options.Sender))
        {
            _logger.LogWarning("Email not configured. Skipping notification for {Email}.", to);
            return;
        }

        var client = new EmailClient(_options.ConnectionString);
        var subject = $"Your Time Capsule \"{title}\" is now public";
        var textBody = $"Your Time Capsule message titled '{title}' is now public as of {publishAt:MMMM dd, yyyy HH:mm} UTC.";
        var htmlBody = $"<p>Your Time Capsule message titled <strong>{System.Net.WebUtility.HtmlEncode(title)}</strong> is now public as of {publishAt:MMMM dd, yyyy HH:mm} UTC.</p>";

        var content = new EmailContent(subject)
        {
            PlainText = textBody,
            Html = htmlBody
        };

        var recipients = new EmailRecipients(new List<EmailAddress> { new(to) });
        var message = new EmailMessage(_options.Sender, recipients, content);

        await client.SendAsync(Azure.WaitUntil.Completed, message, cancellationToken);
    }
}
