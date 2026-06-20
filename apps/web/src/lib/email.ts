/** E-posta gönderimi — MVP: console log; production: Resend/SendGrid env ile genişletilir */

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html ?? input.text.replace(/\n/g, "<br>"),
      }),
    });
    return res.ok;
  }
  if (process.env.NODE_ENV === "development") {
    console.info("[email:mock]", input.to, input.subject);
  }
  return true;
}
