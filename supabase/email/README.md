# Login-mails (Supabase Auth)

To skabeloner, som begge viser den sekscifrede kode (`{{ .Token }}`):

| Fil | Supabase-skabelon | Emne |
| --- | --- | --- |
| `login-kode.html` | Authentication, Email Templates, **Magic Link** | `Din kode til Snow's: {{ .Token }}` |
| `ny-bruger.html` | Authentication, Email Templates, **Confirm signup** | `Velkommen til Snow's. Din kode: {{ .Token }}` |

Indsæt hele filens indhold under "Message body" og emnet under "Subject heading". Tryk Save. Skabelonerne siger, at koden udløber om 1 time. Ændrer du "Email OTP Expiration" under Authentication, Sign In / Providers, Email, skal teksten rettes med.

Afsender (Authentication, SMTP Settings): Sender name `Snow's`, sender email fx `login@send.dayoneclub.dk` (domænet er verificeret i Resend).
