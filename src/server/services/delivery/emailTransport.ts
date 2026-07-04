import { Resend } from "resend";
import { env } from "~/env";

export type DocumentEmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export type SendDocumentEmailResult = {
  messageId: string;
  mode: "resend" | "mock";
};

function getResendClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  return new Resend(env.RESEND_API_KEY);
}

/**
 * Send a document to a destination email (e.g. user's @kindle.com address).
 * Falls back to mock mode when RESEND_API_KEY is not configured (dev/prototype).
 */
export async function sendDocumentEmail(opts: {
  from: string;
  to: string;
  subject: string;
  attachment: DocumentEmailAttachment;
}): Promise<SendDocumentEmailResult> {
  const resend = getResendClient();

  if (!resend) {
    console.info("[kindle-delivery:mock]", {
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      filename: opts.attachment.filename,
      bytes: opts.attachment.content.byteLength,
    });

    return {
      messageId: `mock_${Date.now()}`,
      mode: "mock",
    };
  }

  const { data, error } = await resend.emails.send({
    from: opts.from,
    to: opts.to,
    subject: opts.subject,
    text: "Sent from Read It Later.",
    attachments: [
      {
        filename: opts.attachment.filename,
        content: opts.attachment.content,
        contentType: opts.attachment.contentType,
      },
    ],
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.id) {
    throw new Error("Email provider did not return a message ID");
  }

  return {
    messageId: data.id,
    mode: "resend",
  };
}
