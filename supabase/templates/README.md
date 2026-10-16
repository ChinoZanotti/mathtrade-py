# Plantillas de email de Supabase Auth

Respaldo de las plantillas cargadas a mano en el panel de Supabase
(**Authentication → Emails → Templates**). Si se cambian allá, actualizar acá también.

| Archivo | Plantilla en Supabase | Asunto |
|---|---|---|
| `confirmation.html` | Confirm signup | Confirmá tu cuenta en Math Trade PY |
| `recovery.html` | Reset Password | Recuperá tu contraseña de Math Trade PY |

`{{ .ConfirmationURL }}` lo completa Supabase. Los emails salen por el SMTP de Resend
desde `no-reply@mathtrade.com.py` (configurado en **Authentication → Emails → SMTP Settings**).
