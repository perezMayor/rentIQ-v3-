import nodemailer from "nodemailer";

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true";
  const envFrom = process.env.MAIL_FROM;
  const timeoutMs = Number(process.env.SMTP_TIMEOUT_MS ?? "10000");

  if (!host || !port || !user || !pass) {
    throw new Error("SMTP no configurado (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS)");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    throw new Error("SMTP_TIMEOUT_MS no válido");
  }

  return { host, port, user, pass, secure, envFrom, timeoutMs };
}

function createCompanyTransporter() {
  const config = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: config.timeoutMs,
    greetingTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs,
  });
  return { transporter, config };
}

export async function sendMailFromCompany(input: {
  fromOverride?: string;
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}) {
  // Config SMTP requerida para envío real desde infraestructura de empresa.
  const { transporter, config } = createCompanyTransporter();

  // Prioriza remitente definido en configuración de empresa y cae a MAIL_FROM.
  const from = (input.fromOverride || config.envFrom || "").trim();
  if (!from || !from.includes("@")) {
    throw new Error("MAIL_FROM no válido");
  }

  await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  });
}

export async function verifySmtpConnection(input: { fromOverride?: string; to?: string }) {
  const { transporter, config } = createCompanyTransporter();
  const from = (input.fromOverride || config.envFrom || "").trim();
  if (!from || !from.includes("@")) {
    throw new Error("MAIL_FROM no válido");
  }
  await transporter.verify();
  if (input.to?.trim()) {
    await transporter.sendMail({
      from,
      to: input.to.trim(),
      subject: "Prueba SMTP RentIQ",
      html: "<p>Prueba técnica de conexión SMTP correcta.</p>",
    });
  }
}
